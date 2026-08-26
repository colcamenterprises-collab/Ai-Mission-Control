import { useEffect, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Agent } from "@workspace/api-client-react";

const PRIMARY_TOKEN_STORAGE_KEY = "mission_control_admin_token";
const LEGACY_TOKEN_STORAGE_KEY = "missionControlAdminToken";
const AVATAR_MAX_EDGE = 512;
const AVATAR_WEBP_QUALITY = 0.82;

type EmployeeProfile = {
  agentId: number;
  projectId?: number | null;
  projectName?: string | null;
  avatarUrl?: string | null;
};

function getAdminToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PRIMARY_TOKEN_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY) ?? "";
}

async function resizeAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, AVATAR_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the employee photo.");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", AVATAR_WEBP_QUALITY));
    if (!blob) throw new Error("This browser could not compress the employee photo.");
    return blob;
  } finally {
    bitmap.close();
  }
}

async function uploadAvatar(blob: Blob): Promise<string> {
  const token = getAdminToken();
  const response = await fetch("/api/employee-factory/avatar", {
    method: "POST",
    body: blob,
    headers: {
      Accept: "application/json",
      "Content-Type": blob.type || "image/webp",
      ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as { avatarUrl?: string; error?: string };
  if (!response.ok || !payload.avatarUrl) throw new Error(payload.error || "Mission Control could not save the employee photo.");
  return payload.avatarUrl;
}

async function saveProfile(profile: EmployeeProfile, avatarUrl: string) {
  const token = getAdminToken();
  const response = await fetch(`/api/employee-factory/agents/${profile.agentId}/profile`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {}),
    },
    body: JSON.stringify({ projectId: profile.projectId ?? null, projectName: profile.projectName ?? null, avatarUrl }),
  });
  const payload = await response.json().catch(() => ({})) as EmployeeProfile & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Mission Control could not update the employee avatar.");
  return payload;
}

function initials(agent: Agent) {
  return agent.avatarInitials || agent.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export default function AgentAvatarEditor({ agent, profile, onChanged }: { agent: Agent; profile?: EmployeeProfile; onChanged: (profile: EmployeeProfile) => void }) {
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setAvatarUrl(profile?.avatarUrl || ""), [profile?.avatarUrl, agent.id]);

  const choose = async (file?: File) => {
    if (!file || busy) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Use a PNG, JPG or WebP image."); return; }
    setBusy(true); setError("");
    try {
      const baseProfile: EmployeeProfile = profile ?? { agentId: agent.id, projectId: null, projectName: null, avatarUrl: null };
      const blob = await resizeAvatar(file);
      const uploadedUrl = await uploadAvatar(blob);
      const updated = await saveProfile(baseProfile, uploadedUrl);
      setAvatarUrl(uploadedUrl);
      onChanged({ ...baseProfile, ...updated, avatarUrl: uploadedUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Employee avatar could not be updated.");
    } finally { setBusy(false); }
  };

  return <section className="agent-avatar-editor">
    <div className="agent-avatar-preview">
      {avatarUrl ? <img src={avatarUrl} alt={`${agent.name} avatar`} /> : <span>{initials(agent)}</span>}
    </div>
    <div className="agent-avatar-copy">
      <strong>Employee avatar</strong>
      <span>{avatarUrl ? "Change the image used across the AI Team." : "Add a recognisable image for this employee."}</span>
      {error && <em>{error}</em>}
    </div>
    <label className="agent-avatar-action">
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void choose(event.target.files?.[0]); event.currentTarget.value = ""; }} disabled={busy} />
      <Button type="button" variant="outline" asChild disabled={busy}><span>{busy ? <Loader2 className="agent-avatar-spinner" /> : <ImagePlus />}{busy ? "Uploading" : avatarUrl ? "Change avatar" : "Add avatar"}</span></Button>
    </label>
  </section>;
}
