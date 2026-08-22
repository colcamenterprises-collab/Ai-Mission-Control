import path from "node:path";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, memoriesTable, memoryMetadataTable, memoryRevisionsTable } from "@workspace/db";

const DEFAULT_REPO_ROOT = "/opt/apps/ai-mission-control";
const DEFAULT_OBSIDIAN_VAULT = "/opt/mission-control-vault";
const MAX_FILE_BYTES = 512_000;
let lastSyncAt = 0;
let running: Promise<MemorySyncResult> | null = null;

export type MemorySyncResult = { scanned: number; created: number; updated: number; skipped: number; sources: string[] };

type SourceFile = { filePath: string; source: string; category: "knowledge" | "processes" };

export async function syncMemorySources(options: { force?: boolean } = {}): Promise<MemorySyncResult> {
  const now = Date.now();
  if (!options.force && now - lastSyncAt < 60_000) return { scanned: 0, created: 0, updated: 0, skipped: 0, sources: ["cached"] };
  if (running) return running;
  running = performSync().finally(() => { running = null; lastSyncAt = Date.now(); });
  return running;
}

async function performSync(): Promise<MemorySyncResult> {
  const repoRoot = process.env.MISSION_CONTROL_REPO_ROOT?.trim() || DEFAULT_REPO_ROOT;
  const obsidianVault = process.env.MISSION_CONTROL_OBSIDIAN_VAULT?.trim() || DEFAULT_OBSIDIAN_VAULT;
  const roots: Array<{ root: string; prefix: string; category: "knowledge" | "processes" }> = [
    { root: path.join(repoRoot, "docs"), prefix: "repo-docs", category: "knowledge" },
    { root: path.join(repoRoot, "agent-os"), prefix: "agent-os", category: "processes" },
    { root: path.resolve(obsidianVault), prefix: "obsidian", category: "knowledge" },
  ];

  const files: SourceFile[] = [];
  for (const root of roots) {
    if (!existsSync(root.root)) continue;
    for (const filePath of await markdownFiles(root.root)) {
      const relative = path.relative(root.root, filePath).replaceAll(path.sep, "/");
      files.push({ filePath, source: `${root.prefix}:${relative}`, category: root.category });
    }
  }

  const result: MemorySyncResult = { scanned: files.length, created: 0, updated: 0, skipped: 0, sources: roots.filter((root) => existsSync(root.root)).map((root) => root.prefix) };
  for (const file of files) {
    const info = await stat(file.filePath);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) { result.skipped++; continue; }
    const content = await readFile(file.filePath, "utf8");
    if (!content.trim()) { result.skipped++; continue; }
    const title = firstHeading(content) || prettify(path.basename(file.filePath, path.extname(file.filePath)));
    const preview = content.replace(/^---[\s\S]*?---\s*/m, "").replace(/^#+\s+/gm, "").replace(/\s+/g, " ").trim().slice(0, 150);

    const [metadata] = await db.select().from(memoryMetadataTable).where(eq(memoryMetadataTable.source, file.source));
    if (!metadata) {
      await db.transaction(async (tx) => {
        const [memory] = await tx.insert(memoriesTable).values({ title, content, category: file.category, preview }).returning();
        await tx.insert(memoryMetadataTable).values({ memoryId: memory.id, tier: "WARM", provenance: "source_document", source: file.source, createdBy: "Memory Sync", updatedBy: "Memory Sync", accessPolicy: "owner_and_granted_agents", version: 1, lastVerified: new Date() });
        await tx.insert(memoryRevisionsTable).values({ memoryId: memory.id, version: 1, title, content, category: file.category, changedBy: "Memory Sync", provenance: "source_document" });
      });
      result.created++;
      continue;
    }

    const [current] = await db.select().from(memoriesTable).where(eq(memoriesTable.id, metadata.memoryId));
    if (!current || (current.content === content && current.title === title && current.category === file.category)) { result.skipped++; continue; }
    const nextVersion = metadata.version + 1;
    await db.transaction(async (tx) => {
      await tx.update(memoriesTable).set({ title, content, category: file.category, preview, updatedAt: new Date() }).where(eq(memoriesTable.id, metadata.memoryId));
      await tx.update(memoryMetadataTable).set({ version: nextVersion, updatedBy: "Memory Sync", lastVerified: new Date(), updatedAt: new Date() }).where(eq(memoryMetadataTable.id, metadata.id));
      await tx.insert(memoryRevisionsTable).values({ memoryId: metadata.memoryId, version: nextVersion, title, content, category: file.category, changedBy: "Memory Sync", provenance: "source_document" });
    });
    result.updated++;
  }
  return result;
}

async function markdownFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) output.push(full);
    }
  }
  await walk(root);
  return output.sort();
}

function firstHeading(content: string) { return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || null; }
function prettify(value: string) { return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
