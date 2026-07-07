import path from "node:path";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";

export type SkillSourceMetadata = {
  sourceUrl: string | null;
  sourceRepo: string | null;
  repoOwner: string | null;
  repoName: string | null;
  branch: string | null;
  commitHash: string | null;
  filePath: string | null;
  installedDate: string | null;
  lastSyncTime: string | null;
  enabled: boolean;
};

export type SkillMetadata = {
  id: string;
  name: string;
  path: string;
  category: string;
  lastUpdated: string;
  source: SkillSourceMetadata;
};

export type SkillDocument = SkillMetadata & {
  content: string;
};

export type SkillSourceStatus = {
  id: string;
  type: "local" | "github";
  sourceUrl: string | null;
  sourceRepo: string | null;
  repoOwner: string | null;
  repoName: string | null;
  branch: string | null;
  commitHash: string | null;
  status: "available" | "unavailable";
  lastSyncTime: string | null;
  error: string | null;
};

export type SkillListResult = {
  skills: SkillMetadata[];
  sources: SkillSourceStatus[];
};

type SkillInstallMetadata = Partial<SkillSourceMetadata> & {
  name?: string;
  category?: string;
};

type ExternalSkillSourceRegistryItem = {
  id: string;
  type: "github";
  sourceUrl: string;
  sourceRepo: string;
  repoOwner: string;
  repoName: string;
  targetSkillName: string | null;
};

const DEFAULT_SKILLS_ROOT = "/opt/apps/ai-mission-control/skills";
const MAX_SKILL_BYTES = 256_000;
const EXTERNAL_SOURCE_UNAVAILABLE = "External skill source unavailable or not found.";

const EXTERNAL_SKILL_SOURCE_REGISTRY: ExternalSkillSourceRegistryItem[] = [
  {
    id: "github-anthropics-skills-frontend-design",
    type: "github",
    sourceUrl: "https://github.com/anthropics/skills",
    sourceRepo: "anthropics/skills",
    repoOwner: "anthropics",
    repoName: "skills",
    targetSkillName: "frontend-design",
  },
  {
    id: "github-vercel-agent-skills-web-design-guidelines",
    type: "github",
    sourceUrl: "https://github.com/vercel-labs/agent-skills",
    sourceRepo: "vercel-labs/agent-skills",
    repoOwner: "vercel-labs",
    repoName: "agent-skills",
    targetSkillName: "web-design-guidelines",
  },
  {
    id: "github-garrytan-gbrain",
    type: "github",
    sourceUrl: "https://github.com/garrytan/gbrain",
    sourceRepo: "garrytan/gbrain",
    repoOwner: "garrytan",
    repoName: "gbrain",
    targetSkillName: null,
  },
  {
    id: "github-garrytan-gstack",
    type: "github",
    sourceUrl: "https://github.com/garrytan/gstack",
    sourceRepo: "garrytan/gstack",
    repoOwner: "garrytan",
    repoName: "gstack",
    targetSkillName: null,
  },
];

function findWorkspaceSkillsRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    const candidate = path.join(current, "skills");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start, "skills");
    current = parent;
  }
}

function getSkillsRoot(): string {
  if (process.env.MISSION_CONTROL_SKILLS_DIR) {
    return path.resolve(process.env.MISSION_CONTROL_SKILLS_DIR);
  }
  if (existsSync(DEFAULT_SKILLS_ROOT)) {
    return DEFAULT_SKILLS_ROOT;
  }
  return findWorkspaceSkillsRoot(process.cwd());
}

function encodeSkillId(relativePath: string): string {
  return Buffer.from(relativePath, "utf8").toString("base64url");
}

function decodeSkillId(id: string): string {
  return Buffer.from(id, "base64url").toString("utf8");
}

function parseFrontmatter(content: string): Record<string, string> {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---", 4);
  if (end === -1) return {};
  const body = content.slice(4, end);
  const entries: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.+?)\s*$/);
    if (!match) continue;
    entries[match[1].toLowerCase()] = match[2].replace(/^['\"]|['\"]$/g, "");
  }
  return entries;
}

function normalizeSkillName(filePath: string, frontmatter: Record<string, string>, metadata: SkillInstallMetadata): string {
  if (metadata.name) return metadata.name;
  if (frontmatter.name) return frontmatter.name;
  const parent = path.basename(path.dirname(filePath));
  if (parent && parent !== ".") return parent;
  return path.basename(filePath, path.extname(filePath));
}

function normalizeCategory(frontmatter: Record<string, string>, metadata: SkillInstallMetadata): string {
  if (metadata.category) return metadata.category;
  if (frontmatter.category) return frontmatter.category;
  return "UNMAPPED";
}

function defaultSourceMetadata(relativePath: string): SkillSourceMetadata {
  return {
    sourceUrl: null,
    sourceRepo: null,
    repoOwner: null,
    repoName: null,
    branch: null,
    commitHash: null,
    filePath: relativePath,
    installedDate: null,
    lastSyncTime: null,
    enabled: true,
  };
}

async function readInstallMetadata(skillDir: string, relativePath: string): Promise<SkillInstallMetadata> {
  try {
    const raw = await readFile(path.join(skillDir, "metadata.json"), "utf8");
    return JSON.parse(raw) as SkillInstallMetadata;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultSourceMetadata(relativePath);
    throw error;
  }
}

function normalizeSourceMetadata(metadata: SkillInstallMetadata, relativePath: string): SkillSourceMetadata {
  return {
    sourceUrl: metadata.sourceUrl ?? null,
    sourceRepo: metadata.sourceRepo ?? null,
    repoOwner: metadata.repoOwner ?? null,
    repoName: metadata.repoName ?? null,
    branch: metadata.branch ?? null,
    commitHash: metadata.commitHash ?? null,
    filePath: metadata.filePath ?? relativePath,
    installedDate: metadata.installedDate ?? null,
    lastSyncTime: metadata.lastSyncTime ?? null,
    enabled: metadata.enabled ?? true,
  };
}

async function discoverSkillFiles(dir: string, root: string, output: string[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await discoverSkillFiles(fullPath, root, output);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase() === "skill.md") {
      const relativePath = path.relative(root, fullPath);
      if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) output.push(fullPath);
    }
  }
}

async function readMetadata(filePath: string, root: string): Promise<SkillMetadata> {
  const fileStat = await stat(filePath);
  if (fileStat.size > MAX_SKILL_BYTES) {
    throw new Error(`Skill file exceeds ${MAX_SKILL_BYTES} bytes: ${filePath}`);
  }
  const content = await readFile(filePath, "utf8");
  const frontmatter = parseFrontmatter(content);
  const relativePath = path.relative(root, filePath);
  const installMetadata = await readInstallMetadata(path.dirname(filePath), relativePath);
  const source = normalizeSourceMetadata(installMetadata, relativePath);
  return {
    id: encodeSkillId(relativePath),
    name: normalizeSkillName(filePath, frontmatter, installMetadata),
    path: filePath,
    category: normalizeCategory(frontmatter, installMetadata),
    lastUpdated: fileStat.mtime.toISOString(),
    source,
  };
}

function sourceStatuses(skills: SkillMetadata[]): SkillSourceStatus[] {
  const installedBySource = new Map(skills.filter(skill => skill.source.sourceRepo).map(skill => [skill.source.sourceRepo, skill]));
  const installedSources = skills.map((skill): SkillSourceStatus => ({
    id: skill.source.sourceRepo ?? skill.id,
    type: skill.source.sourceRepo ? "github" : "local",
    sourceUrl: skill.source.sourceUrl,
    sourceRepo: skill.source.sourceRepo,
    repoOwner: skill.source.repoOwner,
    repoName: skill.source.repoName,
    branch: skill.source.branch,
    commitHash: skill.source.commitHash,
    status: skill.source.enabled ? "available" : "unavailable",
    lastSyncTime: skill.source.lastSyncTime,
    error: skill.source.enabled ? null : EXTERNAL_SOURCE_UNAVAILABLE,
  }));
  const missingRegistrySources = EXTERNAL_SKILL_SOURCE_REGISTRY
    .filter(source => !installedBySource.has(source.sourceRepo))
    .map((source): SkillSourceStatus => ({
      id: source.id,
      type: source.type,
      sourceUrl: source.sourceUrl,
      sourceRepo: source.sourceRepo,
      repoOwner: source.repoOwner,
      repoName: source.repoName,
      branch: null,
      commitHash: null,
      status: "unavailable",
      lastSyncTime: null,
      error: EXTERNAL_SOURCE_UNAVAILABLE,
    }));
  const unique = new Map<string, SkillSourceStatus>();
  for (const source of [...installedSources, ...missingRegistrySources]) {
    unique.set(source.sourceRepo ?? source.id, source);
  }
  return [...unique.values()];
}

function filterSkills(skills: SkillMetadata[], filters: { name?: string | null; category?: string | null }): SkillMetadata[] {
  const name = filters.name?.trim().toLowerCase();
  const category = filters.category?.trim().toLowerCase();
  return skills.filter(skill => {
    if (!skill.source.enabled) return false;
    if (name && skill.name.toLowerCase() !== name) return false;
    if (category && skill.category.toLowerCase() !== category) return false;
    return true;
  });
}

export async function listSkills(filters: { name?: string | null; category?: string | null } = {}): Promise<SkillListResult> {
  const root = getSkillsRoot();
  const files: string[] = [];
  await discoverSkillFiles(root, root, files);
  const skills = await Promise.all(files.sort().map(file => readMetadata(file, root)));
  return {
    skills: filterSkills(skills, filters),
    sources: sourceStatuses(skills),
  };
}

export async function readSkill(id: string): Promise<SkillDocument | null> {
  const root = getSkillsRoot();
  const relativePath = decodeSkillId(id);
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(root + path.sep) && filePath !== root) return null;
  if (path.basename(filePath).toLowerCase() !== "skill.md") return null;
  try {
    const metadata = await readMetadata(filePath, root);
    if (!metadata.source.enabled) return null;
    const content = await readFile(filePath, "utf8");
    return { ...metadata, content };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readSkillsForDelegation(filters: { names?: string[]; categories?: string[] }): Promise<SkillDocument[]> {
  const result = await listSkills();
  const names = new Set((filters.names ?? []).map(value => value.toLowerCase()));
  const categories = new Set((filters.categories ?? []).map(value => value.toLowerCase()));
  const selected = result.skills.filter(skill =>
    names.has(skill.name.toLowerCase()) || categories.has(skill.category.toLowerCase()),
  );
  return Promise.all(selected.map(skill => readSkill(skill.id))).then(docs => docs.filter((doc): doc is SkillDocument => Boolean(doc)));
}

export function formatSkillsForPrompt(skills: SkillDocument[]): string {
  if (!skills.length) return "";
  return skills.map(skill => [
    `## Skill: ${skill.name}`,
    `Path: ${skill.path}`,
    `Category: ${skill.category}`,
    `Source Repo: ${skill.source.sourceRepo ?? "local"}`,
    skill.content,
  ].join("\n")).join("\n\n---\n\n");
}
