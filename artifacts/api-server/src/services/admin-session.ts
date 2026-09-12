import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export const OWNER_SESSION_COOKIE = "mc_owner_session";
export const OWNER_SESSION_TTL_SECONDS = 12 * 60 * 60;

type SessionPayload = { sub: string; iat: number; exp: number; nonce: string };

function secret(): string {
  return (
    process.env.MISSION_CONTROL_SESSION_SECRET ||
    process.env.MISSION_CONTROL_ADMIN_TOKEN ||
    ""
  ).trim();
}

function signature(value: string): string {
  const key = secret();
  if (!key)
    throw new Error("Mission Control session signing secret is unavailable");
  return createHmac("sha256", key).update(value).digest("base64url");
}

export function safeEqual(left: string, right: string): boolean {
  const a = createHmac("sha256", "mc-credential-compare").update(left).digest();
  const b = createHmac("sha256", "mc-credential-compare")
    .update(right)
    .digest();
  return timingSafeEqual(a, b);
}

export function issueOwnerSession(subject: string, now = Date.now()): string {
  const payload: SessionPayload = {
    sub: subject,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + OWNER_SESSION_TTL_SECONDS,
    nonce: randomBytes(12).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyOwnerSession(
  token: string | null | undefined,
  now = Date.now(),
): SessionPayload | null {
  if (!token) return null;
  const [encoded, provided, ...extra] = token.split(".");
  if (!encoded || !provided || extra.length) return null;
  let expected: string;
  try {
    expected = signature(encoded);
  } catch {
    return null;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (
      !payload.sub ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Math.floor(now / 1000)
    )
      return null;
    return payload;
  } catch {
    return null;
  }
}

export function ownerSessionFromRequest(req: Request): SessionPayload | null {
  const raw = req.headers.cookie ?? "";
  const cookie = raw
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OWNER_SESSION_COOKIE}=`));
  const token = cookie
    ? decodeURIComponent(cookie.slice(OWNER_SESSION_COOKIE.length + 1))
    : null;
  return verifyOwnerSession(token);
}
