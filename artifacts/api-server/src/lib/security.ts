import crypto from "crypto";

const ENC_PREFIX = "enc:v1";

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  try {
    const b64 = Buffer.from(trimmed, "base64");
    if (b64.length === 32) return b64;
  } catch {}
  try {
    const hex = Buffer.from(trimmed, "hex");
    if (hex.length === 32) return hex;
  } catch {}
  const utf = Buffer.from(trimmed, "utf8");
  if (utf.length === 32) return utf;
  throw new Error("MISSION_CONTROL_ENCRYPTION_KEY must decode to 32 bytes");
}

function getKey(): Buffer {
  const raw = process.env.MISSION_CONTROL_ENCRYPTION_KEY;
  if (!raw) throw new Error("MISSION_CONTROL_ENCRYPTION_KEY is required");
  return parseKey(raw);
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(`${ENC_PREFIX}:`)) {
    // TODO: plaintext legacy secret present; re-save to migrate encrypted at rest.
    return value;
  }

  // Envelope format is: enc:v1:<iv>:<auth-tag>:<ciphertext>.
  // ENC_PREFIX itself contains a colon, so both prefix segments must be skipped.
  // The previous destructuring skipped only one segment and incorrectly treated
  // "v1" as the IV, making every encrypted credential impossible to decrypt.
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") {
    throw new Error("Invalid encrypted secret format");
  }
  const [, , ivB64, tagB64, dataB64] = parts;

  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateAgentToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
