import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  status: "available" | "syncing" | "unavailable" | "auth_required" | "not_found" | "no_skills_found" | "conflict" | "error";
  lastSyncTime: string | null;
  error: string | null;
  skillCount: number;
  sourceLabel: string;
};

export type ListSkillsResponse = { skills: SkillMetadata[]; origins: SkillSourceStatus[]; sources: SkillSourceStatus[] };

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function requiredString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function sourceMetadataFrom(raw: unknown, fallbackPath: string): SkillSourceMetadata {
  const source = isRecord(raw) ? raw : {};
  return {
    sourceUrl: nullableString(source.sourceUrl),
    sourceRepo: nullableString(source.sourceRepo),
    repoOwner: nullableString(source.repoOwner),
    repoName: nullableString(source.repoName),
    branch: nullableString(source.branch),
    commitHash: nullableString(source.commitHash),
    filePath: nullableString(source.filePath) ?? fallbackPath,
    sourceLabel: nullableString(source.sourceLabel) ?? nullableString(source.filePath) ?? fallbackPath,
    originPath: nullableString(source.originPath),
    importedAt: nullableString(source.importedAt),
    importedCommitSha: nullableString(source.importedCommitSha),
    importedBranch: nullableString(source.importedBranch),
    licenseNote: nullableString(source.licenseNote),
    localStatus: source.localStatus === "imported" ? "imported" : "local",
    installedDate: nullableString(source.installedDate),
    lastSyncTime: nullableString(source.lastSyncTime),
    enabled: typeof source.enabled === "boolean" ? source.enabled : true,
  };
}

function skillFrom(raw: unknown, index: number): SkillMetadata | null {
  if (!isRecord(raw)) return null;
  const path = requiredString(raw.path, "UNMAPPED");
  const id = requiredString(raw.id, path !== "UNMAPPED" ? path : `skill-${index}`);
  return {
    id,
    name: requiredString(raw.name, id),
    title: requiredString(raw.title, requiredString(raw.name, id)),
    description: nullableString(raw.description),
    path,
    category: requiredString(raw.category, "UNMAPPED"),
    status: nullableString(raw.status),
    lastUpdated: requiredString(raw.lastUpdated, ""),
    source: sourceMetadataFrom(raw.source, path),
  };
}

function sourceStatusFrom(raw: unknown, index: number): SkillSourceStatus | null {
  if (!isRecord(raw)) return null;
  const sourceRepo = nullableString(raw.sourceRepo);
  const id = requiredString(raw.id, sourceRepo ?? `source-${index}`);
  return {
    id,
    type: raw.type === "github" ? "github" : "local",
    sourceUrl: nullableString(raw.sourceUrl),
    sourceRepo,
    repoOwner: nullableString(raw.repoOwner),
    repoName: nullableString(raw.repoName),
    branch: nullableString(raw.branch),
    commitHash: nullableString(raw.commitHash),
    status: ["available", "syncing", "unavailable", "auth_required", "not_found", "no_skills_found", "conflict", "error"].includes(String(raw.status)) ? raw.status as SkillSourceStatus["status"] : "error",
    lastSyncTime: nullableString(raw.lastSyncTime),
    error: nullableString(raw.error),
    skillCount: typeof raw.skillCount === "number" ? raw.skillCount : 0,
    sourceLabel: requiredString(raw.sourceLabel, sourceRepo ?? id),
  };
}

function skillDocumentFrom(raw: unknown): SkillDocument {
  const skill = skillFrom(raw, 0);
  if (!skill || !isRecord(raw) || typeof raw.content !== "string") {
    throw new Error("Skill detail response did not include a valid skill document.");
  }
  return { ...skill, content: raw.content };
}

function listSkillsResponseFrom(raw: unknown): ListSkillsResponse {
  const body = isRecord(raw) ? raw : {};
  const skills = (Array.isArray(body.skills) ? body.skills : [])
    .map(skillFrom)
    .filter((skill): skill is SkillMetadata => Boolean(skill));
  const originRows = Array.isArray(body.origins) ? body.origins : (Array.isArray(body.sources) ? body.sources : []);
  const sources = originRows
    .map(sourceStatusFrom)
    .filter((source): source is SkillSourceStatus => Boolean(source));
  return { skills, origins: sources, sources };
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("mission_control_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${url}`, { ...init, headers: { ...authHeaders(), ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export function useListSkills(filters: { name?: string; category?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.name) params.set("name", filters.name);
  if (filters.category) params.set("category", filters.category);
  const query = params.toString();
  return useQuery({
    queryKey: ["skills", filters],
    queryFn: async () => listSkillsResponseFrom(await apiFetch<unknown>(`/skills${query ? `?${query}` : ""}`)),
  });
}

export function useGetSkill(id: string | null) {
  return useQuery({
    queryKey: ["skills", id],
    queryFn: async () => skillDocumentFrom(await apiFetch<unknown>(`/skills/${id}`)),
    enabled: Boolean(id),
  });
}


export function useSyncSkills() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => listSkillsResponseFrom(await apiFetch<unknown>("/skills/sync", { method: "POST" })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
