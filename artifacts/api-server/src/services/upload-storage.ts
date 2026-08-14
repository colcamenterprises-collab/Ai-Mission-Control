import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_SCOPES = new Set(["tasks", "ideas"]);

export type StoredAttachment = {
  name: string;
  url: string;
  mimeType?: string;
  uploadedBy: string;
  uploadedAt: string;
};

export function uploadRoot(): string {
  return process.env.MISSION_CONTROL_UPLOAD_DIR || path.join(process.cwd(), "var", "uploads");
}

function safeName(name: string): string {
  const cleaned = path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "attachment";
}

export function resolveStoredAttachment(scope: string, id: number, storedName: string): string | null {
  if (!ALLOWED_SCOPES.has(scope) || !Number.isInteger(id) || id < 1) return null;
  const file = path.basename(storedName);
  if (file !== storedName || !file) return null;
  return path.join(uploadRoot(), scope, String(id), file);
}

export async function storeAttachment(params: {
  scope: "tasks" | "ideas";
  id: number;
  name: string;
  mimeType?: string;
  dataBase64: string;
  uploadedBy?: string;
}): Promise<StoredAttachment> {
  const originalName = safeName(params.name);
  const base64 = params.dataBase64.includes(",") ? params.dataBase64.slice(params.dataBase64.indexOf(",") + 1) : params.dataBase64;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) throw new Error("Attachment is empty");
  if (buffer.length > MAX_ATTACHMENT_BYTES) throw new Error("Attachment exceeds 10 MB limit");

  const extension = path.extname(originalName).slice(0, 12);
  const storedName = `${randomUUID()}${extension}`;
  const directory = path.join(uploadRoot(), params.scope, String(params.id));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, storedName), buffer, { flag: "wx" });

  return {
    name: originalName,
    url: `/api/uploads/${params.scope}/${params.id}/${storedName}`,
    mimeType: params.mimeType,
    uploadedBy: params.uploadedBy || "Cameron",
    uploadedAt: new Date().toISOString(),
  };
}
