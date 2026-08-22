import { promises as fs } from "node:fs";
import path from "node:path";
import { eq, isNull } from "drizzle-orm";
import { db, inboxItemsTable } from "@workspace/db";

export const noteKinds = ["note", "idea", "research", "decision", "reference"] as const;
export type NoteKind = (typeof noteKinds)[number];

const NOTE_MARKER = /^<!--\s*mission-note-kind:(note|idea|research|decision|reference)\s*-->\s*\n?/i;
const DEFAULT_VAULT = "/opt/mission-control-vault";

export function normalizeNoteKind(value: unknown): NoteKind {
  return typeof value === "string" && noteKinds.includes(value.toLowerCase() as NoteKind) ? value.toLowerCase() as NoteKind : "note";
}

export function decodeNoteContent(value: string) {
  const match = value.match(NOTE_MARKER);
  return { kind: normalizeNoteKind(match?.[1]), content: value.replace(NOTE_MARKER, "") };
}

export function encodeNoteContent(kind: NoteKind, content: string) {
  return `<!-- mission-note-kind:${kind} -->\n${content.trim()}`;
}

export function exposeNote<T extends { content: string }>(item: T) {
  const decoded = decodeNoteContent(item.content);
  return { ...item, kind: decoded.kind, content: decoded.content };
}

function vaultRoot() {
  return path.resolve(process.env.MISSION_CONTROL_OBSIDIAN_VAULT?.trim() || DEFAULT_VAULT);
}

function notesRoot() {
  return path.join(vaultRoot(), "Notes");
}

function safeSlug(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return slug || "note";
}

function managedPath(item: { id: number; title: string | null }) {
  return path.join(notesRoot(), `${item.id}-${safeSlug(item.title || "note")}.md`);
}

function markdownFor(item: { id: number; title: string | null; content: string; reviewStatus: string; source: string }) {
  const decoded = decodeNoteContent(item.content);
  const title = item.title?.trim() || "Untitled note";
  return `---\nmission_control_inbox_id: ${item.id}\nkind: ${decoded.kind}\nstatus: ${item.reviewStatus}\nsource: ${item.source}\n---\n\n# ${title}\n\n${decoded.content.trim()}\n`;
}

function parseMarkdown(markdown: string, fallbackTitle: string) {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  const body = frontmatter ? markdown.slice(frontmatter[0].length) : markdown;
  const idMatch = frontmatter?.[1].match(/^mission_control_inbox_id:\s*(\d+)\s*$/m);
  const kindMatch = frontmatter?.[1].match(/^kind:\s*([a-z_]+)\s*$/m);
  const heading = body.match(/^#\s+(.+)$/m);
  const content = body.replace(/^#\s+.+\n?/m, "").trim();
  return {
    id: idMatch ? Number(idMatch[1]) : null,
    kind: normalizeNoteKind(kindMatch?.[1]),
    title: heading?.[1]?.trim() || fallbackTitle,
    content,
  };
}

export async function writeNoteToObsidian(item: { id: number; title: string | null; content: string; reviewStatus: string; source: string }) {
  const root = notesRoot();
  await fs.mkdir(root, { recursive: true, mode: 0o750 });
  const files = await fs.readdir(root).catch(() => [] as string[]);
  const prefix = `${item.id}-`;
  for (const file of files) {
    if (file.startsWith(prefix) && file.endsWith(".md") && path.join(root, file) !== managedPath(item)) await fs.unlink(path.join(root, file)).catch(() => undefined);
  }
  await fs.writeFile(managedPath(item), markdownFor(item), { encoding: "utf8", mode: 0o640 });
}

export async function archiveNoteInObsidian(item: { id: number; title: string | null; content: string; reviewStatus: string; source: string }) {
  const root = notesRoot();
  const archive = path.join(root, "Archive");
  await fs.mkdir(archive, { recursive: true, mode: 0o750 });
  const source = managedPath(item);
  const target = path.join(archive, path.basename(source));
  try { await fs.rename(source, target); }
  catch { await fs.writeFile(target, markdownFor(item), { encoding: "utf8", mode: 0o640 }); }
}

export async function syncNotesFromObsidian() {
  const root = notesRoot();
  await fs.mkdir(root, { recursive: true, mode: 0o750 });
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    const filePath = path.join(root, entry.name);
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = parseMarkdown(raw, entry.name.replace(/\.md$/i, ""));
    if (!parsed.content.trim()) continue;
    if (parsed.id) {
      const [existing] = await db.select().from(inboxItemsTable).where(eq(inboxItemsTable.id, parsed.id));
      if (existing && !existing.archivedAt) {
        const decoded = decodeNoteContent(existing.content);
        if (decoded.content.trim() !== parsed.content.trim() || decoded.kind !== parsed.kind || (existing.title || "") !== parsed.title) {
          await db.update(inboxItemsTable).set({ title: parsed.title, content: encodeNoteContent(parsed.kind, parsed.content), updatedAt: new Date() }).where(eq(inboxItemsTable.id, parsed.id));
        }
        continue;
      }
    }
    const [created] = await db.insert(inboxItemsTable).values({ title: parsed.title, content: encodeNoteContent(parsed.kind, parsed.content), source: "imported", createdBy: "Obsidian" }).returning();
    await writeNoteToObsidian(created);
    if (filePath !== managedPath(created)) await fs.unlink(filePath).catch(() => undefined);
  }

  const active = await db.select().from(inboxItemsTable).where(isNull(inboxItemsTable.archivedAt));
  for (const item of active) {
    const target = managedPath(item);
    try { await fs.access(target); }
    catch { await writeNoteToObsidian(item); }
  }
}
