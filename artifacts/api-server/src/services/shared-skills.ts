import path from "node:path";
import { existsSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";

const MAX_SKILL_BYTES = 256_000;
const ID_PREFIX = "vault:";
const ALLOWED_STATUSES = new Set(["proposed", "needs-review", "approved", "deprecated"]);

export type SharedSkillMetadata = {
  id: string;
  name: string;
  title: string;
  description: string | null;
  path: string;
  category: string;
  status: string;
  lastUpdated: string;
  source: {
    sourceUrl: null;
    sourceRepo: "obsidian-vault";
    repoOwner: null;
    repoName: null;
    branch: null;
    commitHash: null;
    filePath: string;
    sourceLabel: string;
    originPath: string;
    importedAt: null;
    importedCommitSha: null;
    importedBranch: null;
    licenseNote: null;
    localStatus: "local";
    importedContentHash: null;
    installedDate: null;
    lastSyncTime: null;
    enabled: boolean;
  };
};

export type SharedSkillDocument = SharedSkillMetadata & { content: string };

function roots(): string[] {
  const configured = process.env.MISSION_CONTROL_SHARED_SKILLS_DIRS ?? process.env.MISSION_CONTROL_OBSIDIAN_SKILLS_DIR ?? "";
  return [...new Set(configured.split(",").map((item) => item.trim()).filter(Boolean).map((item) => path.resolve(item)))];
}

function frontmatter(content: string): Record<string, string> {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---", 4);
  if (end === -1) return {};
  const result: Record<string, string> = {};
  for (const line of content.slice(4, end).split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/);
    if (match) result[match[1].toLowerCase()] = match[2].replace(/^['\"]|['\"]$/g, "");
  }
  return result;
}

function encode(rootIndex: number, relative: string): string {
  return `${ID_PREFIX}${Buffer.from(`${rootIndex}:${relative}`, "utf8").toString("base64url")}`;
}

function decode(id: string): { rootIndex: number; relative: string } | null {
  if (!id.startsWith(ID_PREFIX)) return null;
  try {
    const value = Buffer.from(id.slice(ID_PREFIX.length), "base64url").toString("utf8");
    const split = value.indexOf(":");
    const rootIndex = Number(value.slice(0, split));
    const relative = value.slice(split + 1);
    if (!Number.isInteger(rootIndex) || rootIndex < 0 || !relative) return null;
    return { rootIndex, relative };
  } catch {
    return null;
  }
}

function titleCase(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()).trim();
}

async function discover(dir: string, root: string, output: string[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await discover(full, root, output);
    else if (entry.isFile() && entry.name.toLowerCase() === "skill.md") {
      const relative = path.relative(root, full);
      if (!relative.startsWith("..") && !path.isAbsolute(relative)) output.push(full);
    }
  }
}

async function metadata(root: string, rootIndex: number, file: string): Promise<SharedSkillMetadata> {
  const info = await stat(file);
  if (info.size > MAX_SKILL_BYTES) throw new Error(`Shared skill exceeds ${MAX_SKILL_BYTES} bytes: ${file}`);
  const content = await readFile(file, "utf8");
  const fm = frontmatter(content);
  const relative = path.relative(root, file);
  const folderName = path.basename(path.dirname(file));
  const status = ALLOWED_STATUSES.has(fm.status) ? fm.status : "needs-review";
  const enabled = status === "approved" && fm.enabled !== "false";
  const name = fm.name || fm.title || folderName;
  return {
    id: encode(rootIndex, relative),
    name,
    title: fm.title || titleCase(name),
    description: fm.description || null,
    path: `vault/${relative}`,
    category: fm.category || path.dirname(relative).split(path.sep)[0] || "Shared",
    status,
    lastUpdated: info.mtime.toISOString(),
    source: {
      sourceUrl: null,
      sourceRepo: "obsidian-vault",
      repoOwner: null,
      repoName: null,
      branch: null,
      commitHash: null,
      filePath: relative,
      sourceLabel: `Obsidian Vault ${rootIndex + 1}`,
      originPath: file,
      importedAt: null,
      importedCommitSha: null,
      importedBranch: null,
      licenseNote: null,
      localStatus: "local",
      importedContentHash: null,
      installedDate: null,
      lastSyncTime: null,
      enabled,
    },
  };
}

export async function listSharedSkills(): Promise<{ skills: SharedSkillMetadata[]; sources: Array<Record<string, unknown>> }> {
  const configuredRoots = roots();
  const skills: SharedSkillMetadata[] = [];
  const sources: Array<Record<string, unknown>> = [];
  for (let rootIndex = 0; rootIndex < configuredRoots.length; rootIndex += 1) {
    const root = configuredRoots[rootIndex];
    const files: string[] = [];
    await discover(root, root, files);
    for (const file of files.sort()) skills.push(await metadata(root, rootIndex, file));
    sources.push({
      id: `obsidian-vault-${rootIndex + 1}`,
      type: "local",
      sourceUrl: null,
      sourceRepo: "obsidian-vault",
      repoOwner: null,
      repoName: null,
      branch: null,
      commitHash: null,
      status: existsSync(root) ? "available" : "not_found",
      lastSyncTime: null,
      error: existsSync(root) ? null : `Shared skills directory not found: ${root}`,
      skillCount: skills.filter((skill) => skill.source.sourceLabel === `Obsidian Vault ${rootIndex + 1}`).length,
      sourceLabel: `Obsidian Vault ${rootIndex + 1}`,
    });
  }
  return { skills, sources };
}

function resolveSharedFile(id: string): { root: string; file: string; rootIndex: number } | null {
  const decoded = decode(id);
  const configuredRoots = roots();
  if (!decoded || decoded.rootIndex >= configuredRoots.length) return null;
  const root = configuredRoots[decoded.rootIndex];
  const file = path.resolve(root, decoded.relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return null;
  return { root, file, rootIndex: decoded.rootIndex };
}

export async function readSharedSkill(id: string): Promise<SharedSkillDocument | null> {
  const resolved = resolveSharedFile(id);
  if (!resolved || !existsSync(resolved.file)) return null;
  const item = await metadata(resolved.root, resolved.rootIndex, resolved.file);
  return { ...item, content: await readFile(resolved.file, "utf8") };
}

function setFrontmatterStatus(content: string, status: string): string {
  if (content.startsWith("---\n")) {
    const end = content.indexOf("\n---", 4);
    if (end !== -1) {
      const head = content.slice(4, end);
      const next = /^status:\s*.*$/m.test(head)
        ? head.replace(/^status:\s*.*$/m, `status: ${status}`)
        : `${head}\nstatus: ${status}`;
      return `---\n${next}\n---${content.slice(end + 4)}`;
    }
  }
  return `---\nstatus: ${status}\n---\n${content}`;
}

export async function setSharedSkillStatus(id: string, status: string): Promise<SharedSkillDocument | null> {
  if (!ALLOWED_STATUSES.has(status)) throw new Error("Invalid shared skill status");
  const resolved = resolveSharedFile(id);
  if (!resolved || !existsSync(resolved.file)) return null;
  const content = await readFile(resolved.file, "utf8");
  await writeFile(resolved.file, setFrontmatterStatus(content, status), "utf8");
  return readSharedSkill(id);
}
