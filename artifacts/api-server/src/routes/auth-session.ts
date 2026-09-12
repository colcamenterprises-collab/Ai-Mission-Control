import { Router, type IRouter } from "express";
import { createRateLimit } from "../lib/rate-limit.js";
import { auditLog } from "../lib/audit.js";
import {
  OWNER_SESSION_COOKIE,
  OWNER_SESSION_TTL_SECONDS,
  issueOwnerSession,
  ownerSessionFromRequest,
  safeEqual,
} from "../services/admin-session.js";

const router: IRouter = Router();
const loginLimit = createRateLimit("owner-login", 8, 10 * 60_000);
const secureCookie = () =>
  (process.env.MISSION_CONTROL_PUBLIC_ORIGIN ?? "").startsWith("https://") ||
  process.env.NODE_ENV === "production";

router.get("/auth/session", (req, res): void => {
  const session = ownerSessionFromRequest(req);
  res.json({
    authenticated: Boolean(session),
    user: session?.sub ?? null,
    expiresAt: session ? new Date(session.exp * 1000).toISOString() : null,
  });
});

router.post("/auth/login", loginLimit, async (req, res): Promise<void> => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");
  const expectedUsername = (
    process.env.MISSION_CONTROL_OWNER_USERNAME || "owner"
  ).trim();
  const expectedPassword = (
    process.env.MISSION_CONTROL_OWNER_PASSWORD ||
    process.env.MISSION_CONTROL_ADMIN_TOKEN ||
    ""
  ).trim();
  if (
    !expectedPassword ||
    !safeEqual(username, expectedUsername) ||
    !safeEqual(password, expectedPassword)
  ) {
    await auditLog({
      action: "owner_login_failed",
      entityType: "session",
      entityId: username || "unknown",
      actorType: "admin",
      actorName: username || "unknown",
    }).catch(() => undefined);
    res.status(401).json({ error: "Invalid sign-in" });
    return;
  }
  const token = issueOwnerSession(expectedUsername);
  res.cookie(OWNER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "strict",
    path: "/",
    maxAge: OWNER_SESSION_TTL_SECONDS * 1000,
  });
  await auditLog({
    action: "owner_login",
    entityType: "session",
    entityId: expectedUsername,
    actorType: "admin",
    actorName: expectedUsername,
  }).catch(() => undefined);
  res.json({
    authenticated: true,
    user: expectedUsername,
    expiresInSeconds: OWNER_SESSION_TTL_SECONDS,
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const session = ownerSessionFromRequest(req);
  res.clearCookie(OWNER_SESSION_COOKIE, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "strict",
    path: "/",
  });
  if (session)
    await auditLog({
      action: "owner_logout",
      entityType: "session",
      entityId: session.sub,
      actorType: "admin",
      actorName: session.sub,
    }).catch(() => undefined);
  res.json({ authenticated: false });
});

export default router;
