#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_SKILL_BYTES = 256_000;
const DEFAULT_SKILLS_ROOT = process.env.MISSION_CONTROL_SKILLS_DIR
  ? path.resolve(process.env.MISSION_CONTROL_SKILLS_DIR)
  : path.resolve(process.cwd(), "skills");

const SOURCES = [
  {
    id: "github-anthropics-skills-frontend-design",
    sourceUrl: "https://github.com/anthropics/skills",
    sourceRepo: "anthropics/skills",
    repoOwner: "anthropics",
    repoName: "skills",
    mode: "single",
    targetSkillName: "frontend-design",
    sourcePath: "skills/frontend-design/SKILL.md",
  },
  {
    id: "github-vercel-agent-skills-web-design-guidelines",
    sourceUrl: "https://github.com/vercel-labs/agent-skills",
    sourceRepo: "vercel-labs/agent-skills",
    repoOwner: "vercel-labs",
    repoName: "agent-skills",
    mode: "single",
    targetSkillName: "web-design-guidelines",
    sourcePath: "skills/web-design-guidelines/SKILL.md",
  },
  {
    id: "github-garrytan-gbrain",
    sourceUrl: "https://github.com/garrytan/gbrain",
    sourceRepo: "garrytan/gbrain",
    repoOwner: "garrytan",
    repoName: "gbrain",
    mode: "mirror-markdown",
    targetPrefix: "gbrain",
  },
  {
    id: "github-garrytan-gstack",
    sourceUrl: "https://github.com/garrytan/gstack",
    sourceRepo: "garrytan/gstack",
    repoOwner: "garrytan",
    repoName: "gstack",
    mode: "mirror-markdown",
    targetPrefix: "gstack",
  },
];

function githubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "mission-control-skills-sync",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: githubHeaders(), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: githubHeaders(), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_SKILL_BYTES) throw new Error("Source Markdown exceeds maximum skill size");
  return text;
}

async function getRevision(source) {
  const repo = await fetchJson(`https://api.github.com/repos/${source.repoOwner}/${source.repoName}`);
  const branch = repo.default_branch;
  if (!branch) throw new Error("Missing default branch");
  const ref = await fetchJson(`https://api.github.com/repos/${source.repoOwner}/${source.repoName}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commitHash = ref.object?.sha;
  if (!commitHash) throw new Error("Missing commit hash");
  return { branch, commitHash };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/\.md$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unmapped";
}

async function readExistingInstalledDate(skillDir, fallback) {
  try {
    const raw = await readFile(path.join(skillDir, "metadata.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed.installedDate ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeSkill({ source, revision, sourcePath, targetSkillName, content, syncTime }) {
  const skillDir = path.join(DEFAULT_SKILLS_ROOT, targetSkillName);
  await mkdir(skillDir, { recursive: true });
  const installedDate = await readExistingInstalledDate(skillDir, syncTime);
  const metadata = {
    name: targetSkillName,
    category: "UNMAPPED",
    sourceUrl: source.sourceUrl,
    sourceRepo: source.sourceRepo,
    repoOwner: source.repoOwner,
    repoName: source.repoName,
    branch: revision.branch,
    commitHash: revision.commitHash,
    filePath: sourcePath,
    installedDate,
    lastSyncTime: syncTime,
    enabled: true,
  };
  await writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");
  await writeFile(path.join(skillDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

async function syncSingle(source, revision, syncTime) {
  const rawUrl = `https://raw.githubusercontent.com/${source.sourceRepo}/${encodeURIComponent(revision.commitHash)}/${source.sourcePath.split("/").map(encodeURIComponent).join("/")}`;
  const content = await fetchText(rawUrl);
  await writeSkill({ source, revision, sourcePath: source.sourcePath, targetSkillName: source.targetSkillName, content, syncTime });
}

async function syncMarkdownMirror(source, revision, syncTime) {
  const tree = await fetchJson(`https://api.github.com/repos/${source.repoOwner}/${source.repoName}/git/trees/${encodeURIComponent(revision.commitHash)}?recursive=1`);
  const docs = (tree.tree ?? [])
    .filter(item => item.type === "blob" && item.path?.toLowerCase().endsWith(".md") && (item.size ?? 0) <= MAX_SKILL_BYTES)
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const doc of docs) {
    const rawUrl = `https://raw.githubusercontent.com/${source.sourceRepo}/${encodeURIComponent(revision.commitHash)}/${doc.path.split("/").map(encodeURIComponent).join("/")}`;
    const content = await fetchText(rawUrl);
    const targetSkillName = `${source.targetPrefix}-${slugify(doc.path)}`;
    await writeSkill({ source, revision, sourcePath: doc.path, targetSkillName, content, syncTime });
  }
}

let failed = false;
for (const source of SOURCES) {
  const syncTime = new Date().toISOString();
  try {
    const revision = await getRevision(source);
    if (source.mode === "single") await syncSingle(source, revision, syncTime);
    if (source.mode === "mirror-markdown") await syncMarkdownMirror(source, revision, syncTime);
    console.log(`synced ${source.sourceRepo}`);
  } catch (error) {
    failed = true;
    console.error(`unavailable ${source.sourceRepo}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

if (failed) process.exitCode = 1;
