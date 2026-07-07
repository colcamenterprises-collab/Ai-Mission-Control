import { useQuery } from "@tanstack/react-query";

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

type ListSkillsResponse = { skills: SkillMetadata[]; sources: SkillSourceStatus[] };

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("mission_control_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(url: string): Promise<T> {
  const response = await fetch(`/api${url}`, { headers: authHeaders() });
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
    queryFn: () => apiFetch<ListSkillsResponse>(`/skills${query ? `?${query}` : ""}`),
  });
}

export function useGetSkill(id: string | null) {
  return useQuery({
    queryKey: ["skills", id],
    queryFn: () => apiFetch<SkillDocument>(`/skills/${id}`),
    enabled: Boolean(id),
  });
}
