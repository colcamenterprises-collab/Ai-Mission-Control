import type { Request, Response, NextFunction } from "express";
import { db, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashToken } from "./security.js";

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.MISSION_CONTROL_ADMIN_TOKEN;
  if (!expected) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7).trim() : null;
  const token = bearer || (typeof req.headers["x-admin-token"] === "string" ? req.headers["x-admin-token"] : null);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export async function getAgentFromBearer(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const tokenHash = hashToken(token);
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.inboundToken, tokenHash));
  return agent ?? null;
}
