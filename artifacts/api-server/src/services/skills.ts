import path from "node:path";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SkillSourceSyncStatus = "available" | "syncing" | "unavailable" | "auth_required" | "not_found" | "no_skills_found" | "conflict" | "error";

export type SkillSourceMetadata = {
  sourceUrl: string | null;
  sourceRepo: string | null;
  repoOwner: string | null;
  repoName: string | null;
  branch: string | null;
  commitHash: string | null;
  filePath: string | null;
  sourceLabel: string | null;
  originPath: string | null;
  importedAt: string | null;
  importedCommitSha: string | null;
  importedBranch: string | null;
  licenseNote: string | null;
  localStatus: "local" | "imported";
  importedContentHash: string | null;
  installedDate: string | null;
  lastSyncTime: string | null;
  enabled: boolean;
};

export type SkillMetadata = {
  id: string;
  name: string;
  title: string;
  description: string | null;
  path: string;
  category: string;
  status: string | null;
  lastUpdated: string;
  source: SkillSourceMetadata;
};

export type SkillDocument = SkillMetadata & { content: string };

export type SkillSourceStatus = {
  id: string;
  type: "local" | "github";
  sourceUrl: string | null;
  sourceRepo: string | null;
  repoOwner: string | null;
  repoName: string | null;
  branch: string | null;
  commitHash: string | null;
  status: SkillSourceSyncStatus;
  lastSyncTime: string | null;
  error: string | null;
  skillCount: number;
  sourceLabel: string;
};

export type SkillListResult = { skills: SkillMetadata[]; origins: SkillSourceStatus[]; sources: SkillSourceStatus[] };
export type SkillSyncResult = SkillListResult;

type SkillInstallMetadata = Partial<SkillSourceMetadata> & { name?: string; title?: string; description?: string; category?: string; status?: string; syncStatus?: SkillSourceSyncStatus; error?: string | null; skillCount?: number };
type ExternalSkillSourceRegistryItem = { id: string; type: "github"; sourceUrl: string; sourceRepo: string; repoOwner: string; repoName: string; targetSkillName: string | null };
type PersistedSourceStatus = SkillSourceStatus;

const DEFAULT_SKILLS_ROOT = "/opt/apps/ai-mission-control/skills";
const DEFAULT_REPO_ROOT = "/opt/apps/ai-mission-control";
const MAX_SKILL_BYTES = 256_000;
const GIT_TIMEOUT_MS = 30_000;
const SOURCE_STATUS_FILE = ".skill-source-status.json";
const IMPORTED_LIBRARY_DIR = path.join("library", "imported");
const AGENT_OS_PREFIX = "agent-os:";
const AGENT_OS_DIRS = ["product", "standards", "specs"];

const DEFAULT_EXTERNAL_SKILL_SOURCE_REGISTRY: ExternalSkillSourceRegistryItem[] = [
  { id: "github-anthropics-skills", type: "github", sourceUrl: "https://github.com/anthropics/skills", sourceRepo: "anthropics/skills", repoOwner: "anthropics", repoName: "skills", targetSkillName: null },
  { id: "github-vercel-agent-skills", type: "github", sourceUrl: "https://github.com/vercel-labs/agent-skills", sourceRepo: "vercel-labs/agent-skills", repoOwner: "vercel-labs", repoName: "agent-skills", targetSkillName: null },
  { id: "github-garrytan-ghrain", type: "github", sourceUrl: "https://github.com/garrytan/ghrain", sourceRepo: "garrytan/ghrain", repoOwner: "garrytan", repoName: "ghrain", targetSkillName: null },
];

function findWorkspaceSkillsRoot(start: string): string { let current = path.resolve(start); while (true) { const candidate = path.join(current, "skills"); if (existsSync(candidate)) return candidate; const parent = path.dirname(current); if (parent === current) return path.resolve(start, "skills"); current = parent; } }
function getSkillsRoot(): string { if (process.env.MISSION_CONTROL_SKILLS_DIR) return path.resolve(process.env.MISSION_CONTROL_SKILLS_DIR); if (existsSync(DEFAULT_SKILLS_ROOT)) return DEFAULT_SKILLS_ROOT; return findWorkspaceSkillsRoot(process.cwd()); }
function getRepoRoot(): string { if (process.env.MISSION_CONTROL_REPO_ROOT) return path.resolve(process.env.MISSION_CONTROL_REPO_ROOT); const skillsRoot = getSkillsRoot(); if (path.basename(skillsRoot) === "skills") return path.dirname(skillsRoot); if (existsSync(DEFAULT_REPO_ROOT)) return DEFAULT_REPO_ROOT; return process.cwd(); }
function getAgentOsRoot(): string { return path.join(getRepoRoot(), "agent-os"); }
function getCacheRoot(root = getSkillsRoot()): string { return process.env.MISSION_CONTROL_SKILLS_CACHE_DIR ? path.resolve(process.env.MISSION_CONTROL_SKILLS_CACHE_DIR) : path.join(root, ".cache", "skill-sources"); }
function encodeSkillId(relativePath: string): string { return Buffer.from(relativePath, "utf8").toString("base64url"); }
function encodeAgentOsId(relativePath: string): string { return Buffer.from(`${AGENT_OS_PREFIX}${relativePath}`, "utf8").toString("base64url"); }
function decodeSkillId(id: string): string { return Buffer.from(id, "base64url").toString("utf8"); }
function sourceKey(source: Pick<SkillSourceStatus, "sourceRepo" | "id">): string { return source.sourceRepo ?? source.id; }
function repoUrl(source: ExternalSkillSourceRegistryItem): string { return source.sourceUrl.endsWith(".git") || source.sourceUrl.startsWith("file://") ? source.sourceUrl : `https://github.com/${source.sourceRepo}.git`; }
function sanitizeSegment(value: string): string { return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "source"; }
function sha256(content: string): string { return createHash("sha256").update(content, "utf8").digest("hex"); }
function titleCase(value: string): string { return value.replace(/[-_]+/g, " ").replace(/\b\w/g, char => char.toUpperCase()).trim(); }

function parseFrontmatter(content: string): Record<string, string> { if (!content.startsWith("---\n")) return {}; const end = content.indexOf("\n---", 4); if (end === -1) return {}; const entries: Record<string, string> = {}; for (const line of content.slice(4, end).split("\n")) { const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.+?)\s*$/); if (match) entries[match[1].toLowerCase()] = match[2].replace(/^[']|[']$/g, "").replace(/^[\"]|[\"]$/g, ""); } return entries; }
function normalizeSkillName(filePath: string, frontmatter: Record<string, string>, metadata: SkillInstallMetadata): string { return metadata.name ?? metadata.title ?? frontmatter.name ?? frontmatter.title ?? path.basename(path.dirname(filePath)) ?? path.basename(filePath, path.extname(filePath)); }
function normalizeSkillTitle(name: string, frontmatter: Record<string, string>, metadata: SkillInstallMetadata): string { return metadata.title ?? frontmatter.title ?? name; }
function normalizeDescription(frontmatter: Record<string, string>, metadata: SkillInstallMetadata): string | null { return metadata.description ?? frontmatter.description ?? null; }
function normalizeCategory(frontmatter: Record<string, string>, metadata: SkillInstallMetadata): string { return metadata.category ?? frontmatter.category ?? "UNMAPPED"; }
function normalizeStatus(frontmatter: Record<string, string>, metadata: SkillInstallMetadata): string | null { return metadata.status ?? frontmatter.status ?? null; }
function defaultSourceMetadata(relativePath: string): SkillSourceMetadata { return { sourceUrl: null, sourceRepo: null, repoOwner: null, repoName: null, branch: null, commitHash: null, filePath: relativePath, sourceLabel: relativePath, originPath: null, importedAt: null, importedCommitSha: null, importedBranch: null, licenseNote: null, localStatus: "local", importedContentHash: null, installedDate: null, lastSyncTime: null, enabled: true }; }
async function readInstallMetadata(skillDir: string, relativePath: string): Promise<SkillInstallMetadata> { try { return JSON.parse(await readFile(path.join(skillDir, "metadata.json"), "utf8")) as SkillInstallMetadata; } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultSourceMetadata(relativePath); throw error; } }
function normalizeSourceMetadata(metadata: SkillInstallMetadata, relativePath: string): SkillSourceMetadata { const localStatus = metadata.sourceRepo ? "imported" : "local"; return { sourceUrl: metadata.sourceUrl ?? null, sourceRepo: metadata.sourceRepo ?? null, repoOwner: metadata.repoOwner ?? null, repoName: metadata.repoName ?? null, branch: metadata.branch ?? metadata.importedBranch ?? null, commitHash: metadata.commitHash ?? metadata.importedCommitSha ?? null, filePath: metadata.filePath ?? relativePath, sourceLabel: metadata.sourceLabel ?? metadata.filePath ?? relativePath, originPath: metadata.originPath ?? metadata.filePath ?? null, importedAt: metadata.importedAt ?? metadata.installedDate ?? null, importedCommitSha: metadata.importedCommitSha ?? metadata.commitHash ?? null, importedBranch: metadata.importedBranch ?? metadata.branch ?? null, licenseNote: metadata.licenseNote ?? null, localStatus, importedContentHash: metadata.importedContentHash ?? null, installedDate: metadata.installedDate ?? null, lastSyncTime: metadata.lastSyncTime ?? null, enabled: metadata.enabled ?? true }; }

async function discoverSkillFiles(dir: string, root: string, output: string[]): Promise<void> { let entries: import("node:fs").Dirent[]; try { entries = await readdir(dir, { withFileTypes: true }); } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; } for (const entry of entries) { if (entry.name.startsWith(".")) continue; const fullPath = path.join(dir, entry.name); if (entry.isDirectory()) await discoverSkillFiles(fullPath, root, output); else if (entry.isFile() && entry.name.toLowerCase() === "skill.md") { const relativePath = path.relative(root, fullPath); if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) output.push(fullPath); } } }
async function discoverMarkdownFiles(dir: string, root: string, output: string[]): Promise<void> { let entries: import("node:fs").Dirent[]; try { entries = await readdir(dir, { withFileTypes: true }); } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; } for (const entry of entries) { if (entry.name.startsWith(".")) continue; const fullPath = path.join(dir, entry.name); if (entry.isDirectory()) await discoverMarkdownFiles(fullPath, root, output); else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) { const relativePath = path.relative(root, fullPath); if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) output.push(fullPath); } } }
async function discoverLocalSkillFiles(root: string): Promise<string[]> { const files: string[] = []; await discoverSkillFiles(root, root, files); return [...new Set(files)].sort(); }
async function discoverAgentOsFiles(root = getAgentOsRoot()): Promise<string[]> { const files: string[] = []; for (const section of AGENT_OS_DIRS) await discoverMarkdownFiles(path.join(root, section), root, files); return [...new Set(files)].sort(); }

function firstHeading(content: string): string | null { const match = content.match(/^#\s+(.+)$/m); return match?.[1]?.trim() ?? null; }
function firstParagraph(content: string): string | null { const stripped = content.replace(/^#.+$/gm, "").split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("-") && !/^\d+\./.test(line)); return stripped[0] ?? null; }
function agentOsCategory(relativePath: string): string { const top = relativePath.split(path.sep)[0]; if (top === "product") return "Product"; if (top === "standards") return "Standard"; if (top === "specs") return "Spec"; return "Playbook"; }
function agentOsStatus(relativePath: string): string | null { return relativePath.startsWith(`specs${path.sep}`) ? "current-spec" : "active"; }

async function readMetadata(filePath: string, root: string): Promise<SkillMetadata> { const fileStat = await stat(filePath); if (fileStat.size > MAX_SKILL_BYTES) throw new Error(`Skill file exceeds ${MAX_SKILL_BYTES} bytes: ${filePath}`); const content = await readFile(filePath, "utf8"); const frontmatter = parseFrontmatter(content); const relativePath = path.relative(root, filePath); const installMetadata = await readInstallMetadata(path.dirname(filePath), relativePath); const source = normalizeSourceMetadata(installMetadata, relativePath); const name = normalizeSkillName(filePath, frontmatter, installMetadata); return { id: encodeSkillId(relativePath), name, title: normalizeSkillTitle(name, frontmatter, installMetadata), description: normalizeDescription(frontmatter, installMetadata), path: relativePath, category: normalizeCategory(frontmatter, installMetadata), status: normalizeStatus(frontmatter, installMetadata), lastUpdated: fileStat.mtime.toISOString(), source }; }
async function readAgentOsMetadata(filePath: string, root = getAgentOsRoot()): Promise<SkillMetadata> { const fileStat = await stat(filePath); if (fileStat.size > MAX_SKILL_BYTES) throw new Error(`Agent OS playbook exceeds ${MAX_SKILL_BYTES} bytes: ${filePath}`); const content = await readFile(filePath, "utf8"); const relativePath = path.relative(root, filePath); const title = firstHeading(content) ?? titleCase(path.basename(filePath, path.extname(filePath))); return { id: encodeAgentOsId(relativePath), name: title, title, description: firstParagraph(content), path: `agent-os/${relativePath}`, category: agentOsCategory(relativePath), status: agentOsStatus(relativePath), lastUpdated: fileStat.mtime.toISOString(), source: { ...defaultSourceMetadata(`agent-os/${relativePath}`), sourceRepo: "agent-os", sourceLabel: `Agent OS / ${agentOsCategory(relativePath)}`, originPath: relativePath } }; }

async function readPersistedStatuses(root = getSkillsRoot()): Promise<Map<string, PersistedSourceStatus>> { try { const rows = JSON.parse(await readFile(path.join(root, SOURCE_STATUS_FILE), "utf8")) as PersistedSourceStatus[]; return new Map(rows.map(row => [sourceKey(row), row])); } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map(); throw error; } }
async function writePersistedStatuses(statuses: SkillSourceStatus[], root = getSkillsRoot()): Promise<void> { await mkdir(root, { recursive: true }); await writeFile(path.join(root, SOURCE_STATUS_FILE), `${JSON.stringify(statuses, null, 2)}\n`, "utf8"); }

function sourceStatuses(skills: SkillMetadata[], persisted = new Map<string, PersistedSourceStatus>()): SkillSourceStatus[] { const counts = new Map<string, number>(); const skillBySource = new Map<string, SkillMetadata>(); for (const skill of skills) { if (!skill.source.sourceRepo) continue; const key = skill.source.sourceRepo; counts.set(key, (counts.get(key) ?? 0) + 1); skillBySource.set(key, skill); } const statuses: SkillSourceStatus[] = [];
  for (const skill of skills) { if (!skill.source.sourceRepo) continue; const key = skill.source.sourceRepo; if (statuses.some(s => sourceKey(s) === key)) continue; const saved = persisted.get(key); const isAgentOs = key === "agent-os"; statuses.push({ id: key, type: isAgentOs ? "local" : "github", sourceUrl: skill.source.sourceUrl, sourceRepo: skill.source.sourceRepo, repoOwner: skill.source.repoOwner, repoName: skill.source.repoName, branch: skill.source.branch, commitHash: skill.source.commitHash, status: saved?.status ?? (skill.source.enabled ? "available" : "unavailable"), lastSyncTime: skill.source.lastSyncTime ?? saved?.lastSyncTime ?? null, error: saved?.error ?? null, skillCount: counts.get(key) ?? 1, sourceLabel: isAgentOs ? "Agent OS operating playbooks" : (skill.source.sourceLabel ?? skill.source.filePath ?? skill.path) }); }
  for (const source of externalSkillSourceRegistry()) { if (skillBySource.has(source.sourceRepo)) continue; const saved = persisted.get(source.sourceRepo); statuses.push(saved ?? { id: source.id, type: source.type, sourceUrl: source.sourceUrl, sourceRepo: source.sourceRepo, repoOwner: source.repoOwner, repoName: source.repoName, branch: null, commitHash: null, status: "unavailable", lastSyncTime: null, error: "Repository has not been synced yet.", skillCount: 0, sourceLabel: source.sourceRepo }); }
  return statuses; }

function filterSkills(skills: SkillMetadata[], filters: { name?: string | null; category?: string | null }): SkillMetadata[] { const name = filters.name?.trim().toLowerCase(); const category = filters.category?.trim().toLowerCase(); return skills.filter(skill => (skill.source.enabled) && (!name || skill.name.toLowerCase() === name) && (!category || skill.category.toLowerCase() === category)); }

function externalSkillSourceRegistry(): ExternalSkillSourceRegistryItem[] { const raw = process.env.MISSION_CONTROL_EXTERNAL_SKILL_SOURCES; if (!raw) return DEFAULT_EXTERNAL_SKILL_SOURCE_REGISTRY; const parsed = JSON.parse(raw) as ExternalSkillSourceRegistryItem[]; return parsed.map((source) => ({ ...source, type: "github", sourceRepo: source.sourceRepo || `${source.repoOwner}/${source.repoName}` })); }
function gitEnv(): NodeJS.ProcessEnv { const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" }; delete env.GITHUB_TOKEN; return env; }
function gitArgs(args: string[]): string[] { const token = process.env.GITHUB_TOKEN?.trim(); return token ? ["-c", `http.https://github.com/.extraheader=AUTHORIZATION: bearer ${token}`, ...args] : args; }
async function runGit(args: string[], cwd?: string): Promise<string> { try { const { stdout } = await execFileAsync("git", gitArgs(args), { cwd, env: gitEnv(), timeout: GIT_TIMEOUT_MS, maxBuffer: 5_000_000 }); return stdout.trim(); } catch (error: unknown) { const err = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string; signal?: string; killed?: boolean }; const output = `${err.stderr ?? ""}\n${err.stdout ?? ""}`.trim(); if (err.code === "ENOENT") throw new Error("git binary is not installed or is not on PATH."); if (err.killed || err.signal === "SIGTERM") throw new Error("Git operation timed out."); throw new Error(output || err.message); } }
function classifyGitError(message: string): { status: SkillSourceSyncStatus; error: string } { const text = message.toLowerCase(); if (text.includes("authentication failed") || text.includes("could not read username") || text.includes("permission denied") || text.includes("access denied")) return { status: "auth_required", error: message }; if (text.includes("repository not found") || text.includes("not found")) return { status: "not_found", error: message }; if (text.includes("could not resolve host") || text.includes("name or service not known") || text.includes("network is unreachable") || text.includes("connect tunnel failed") || text.includes("proxy")) return { status: "unavailable", error: message }; if (text.includes("timed out")) return { status: "unavailable", error: message }; return { status: "error", error: message }; }

async function copyLicenseFiles(cacheDir: string, targetRoot: string): Promise<string | null> { let copied: string[] = []; try { const entries = await readdir(cacheDir, { withFileTypes: true }); for (const entry of entries) { if (!entry.isFile()) continue; if (!/^(license|notice|copying)(\..*)?$/i.test(entry.name)) continue; await mkdir(targetRoot, { recursive: true }); await copyFile(path.join(cacheDir, entry.name), path.join(targetRoot, entry.name)); copied.push(entry.name); } } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } return copied.length ? `Preserved upstream attribution file(s): ${copied.sort().join(", ")}` : null; }
async function syncOneExternalSource(source: ExternalSkillSourceRegistryItem, root: string, syncTime: string): Promise<SkillSourceStatus> { const cacheDir = path.join(getCacheRoot(root), sanitizeSegment(source.sourceRepo)); const targetRoot = path.join(root, IMPORTED_LIBRARY_DIR, sanitizeSegment(source.repoOwner), sanitizeSegment(source.repoName)); try { await runGit(["ls-remote", "--symref", repoUrl(source), "HEAD"]); await mkdir(path.dirname(cacheDir), { recursive: true }); if (existsSync(path.join(cacheDir, ".git"))) await runGit(["fetch", "--prune", "origin"], cacheDir); else { await rm(cacheDir, { recursive: true, force: true }); await runGit(["clone", "--no-tags", repoUrl(source), cacheDir]); } const branch = (await runGit(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cacheDir)).replace(/^origin\//, ""); await runGit(["checkout", "--force", branch], cacheDir); await runGit(["reset", "--hard", `origin/${branch}`], cacheDir); const commitHash = await runGit(["rev-parse", "HEAD"], cacheDir); const found: string[] = []; await discoverSkillFiles(cacheDir, cacheDir, found); if (!found.length) return { id: source.id, type: source.type, sourceUrl: source.sourceUrl, sourceRepo: source.sourceRepo, repoOwner: source.repoOwner, repoName: source.repoName, branch, commitHash, status: "no_skills_found", lastSyncTime: syncTime, error: "Repository is reachable but contains no SKILL.md files.", skillCount: 0, sourceLabel: source.sourceRepo };
    let conflictCount = 0; const licenseNote = await copyLicenseFiles(cacheDir, targetRoot);
    for (const file of found.sort()) { const relative = path.relative(cacheDir, file); const content = await readFile(file, "utf8"); if (Buffer.byteLength(content, "utf8") > MAX_SKILL_BYTES) continue; const targetDir = path.join(targetRoot, path.dirname(relative)); await mkdir(targetDir, { recursive: true }); const targetFile = path.join(targetDir, "SKILL.md"); const contentHash = sha256(content); let installedDate = syncTime; try { const existingMetadata = JSON.parse(await readFile(path.join(targetDir, "metadata.json"), "utf8")) as SkillInstallMetadata; installedDate = existingMetadata.installedDate ?? existingMetadata.importedAt ?? syncTime; if (existsSync(targetFile) && existingMetadata.importedContentHash && sha256(await readFile(targetFile, "utf8")) !== existingMetadata.importedContentHash) { await writeFile(path.join(targetDir, "SKILL.incoming.md"), content, "utf8"); conflictCount += 1; continue; } } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } await writeFile(targetFile, content, "utf8"); const metadata: SkillInstallMetadata = { sourceUrl: source.sourceUrl, sourceRepo: source.sourceRepo, repoOwner: source.repoOwner, repoName: source.repoName, branch, commitHash, importedBranch: branch, importedCommitSha: commitHash, originPath: relative, filePath: relative, sourceLabel: relative, licenseNote, importedAt: syncTime, importedContentHash: contentHash, installedDate, lastSyncTime: syncTime, enabled: true, syncStatus: "available", error: null, skillCount: found.length }; await writeFile(path.join(targetDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8"); }
    return { id: source.id, type: source.type, sourceUrl: source.sourceUrl, sourceRepo: source.sourceRepo, repoOwner: source.repoOwner, repoName: source.repoName, branch, commitHash, status: conflictCount ? "conflict" : "available", lastSyncTime: syncTime, error: conflictCount ? `${conflictCount} local imported skill file(s) were modified; wrote SKILL.incoming.md and kept existing local skill available.` : null, skillCount: found.length, sourceLabel: source.sourceRepo };
  } catch (error: unknown) { const classified = classifyGitError(error instanceof Error ? error.message : String(error)); return { id: source.id, type: source.type, sourceUrl: source.sourceUrl, sourceRepo: source.sourceRepo, repoOwner: source.repoOwner, repoName: source.repoName, branch: null, commitHash: null, status: classified.status, lastSyncTime: syncTime, error: classified.error, skillCount: 0, sourceLabel: source.sourceRepo }; } }

async function listAllSkillMetadata(): Promise<SkillMetadata[]> { const root = getSkillsRoot(); const files = await discoverLocalSkillFiles(root); const localSkills = await Promise.all(files.map(file => readMetadata(file, root))); const agentOsRoot = getAgentOsRoot(); const playbookFiles = await discoverAgentOsFiles(agentOsRoot); const playbooks = await Promise.all(playbookFiles.map(file => readAgentOsMetadata(file, agentOsRoot))); return [...localSkills, ...playbooks].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)); }

export async function listSkills(filters: { name?: string | null; category?: string | null } = {}): Promise<SkillListResult> { const root = getSkillsRoot(); const skills = await listAllSkillMetadata(); const persisted = await readPersistedStatuses(root); const origins = sourceStatuses(skills, persisted); return { skills: filterSkills(skills, filters), origins, sources: origins }; }
export async function syncSkills(): Promise<SkillSyncResult> { const root = getSkillsRoot(); await mkdir(root, { recursive: true }); const syncTime = new Date().toISOString(); const statuses = await Promise.all(externalSkillSourceRegistry().map(source => syncOneExternalSource(source, root, syncTime))); await writePersistedStatuses(statuses, root); return listSkills(); }
export async function readSkill(id: string): Promise<SkillDocument | null> { const root = getSkillsRoot(); const decoded = decodeSkillId(id); if (decoded.startsWith(AGENT_OS_PREFIX)) { const agentOsRoot = getAgentOsRoot(); const relativePath = decoded.slice(AGENT_OS_PREFIX.length); const filePath = path.resolve(agentOsRoot, relativePath); if (!filePath.startsWith(agentOsRoot + path.sep) && filePath !== agentOsRoot) return null; if (path.extname(filePath).toLowerCase() !== ".md") return null; try { const metadata = await readAgentOsMetadata(filePath, agentOsRoot); return { ...metadata, content: await readFile(filePath, "utf8") }; } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
  const relativePath = decoded; const filePath = path.resolve(root, relativePath); if (!filePath.startsWith(root + path.sep) && filePath !== root) return null; if (path.basename(filePath).toLowerCase() !== "skill.md") return null; try { const metadata = await readMetadata(filePath, root); if (!metadata.source.enabled) return null; return { ...metadata, content: await readFile(filePath, "utf8") }; } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
export async function readSkillsForDelegation(filters: { names?: string[]; categories?: string[] }): Promise<SkillDocument[]> { const result = await listSkills(); const names = new Set((filters.names ?? []).map(value => value.toLowerCase())); const categories = new Set((filters.categories ?? []).map(value => value.toLowerCase())); const selected = result.skills.filter(skill => names.has(skill.name.toLowerCase()) || categories.has(skill.category.toLowerCase())); return Promise.all(selected.map(skill => readSkill(skill.id))).then(docs => docs.filter((doc): doc is SkillDocument => Boolean(doc))); }
export function formatSkillsForPrompt(skills: SkillDocument[]): string { if (!skills.length) return ""; return skills.map(skill => [`## Playbook: ${skill.name}`, `Path: ${skill.path}`, `Category: ${skill.category}`, `Status: ${skill.status ?? "active"}`, `Source: ${skill.source.sourceRepo ?? "local"}`, skill.content].join("\n")).join("\n\n---\n\n"); }
