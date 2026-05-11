import type { Request, Response, NextFunction } from "express";

const hits = new Map<string, { count: number; resetAt: number }>();

export function createRateLimit(name: string, max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${name}:${req.ip ?? "unknown"}`;
    const now = Date.now();
    const current = hits.get(key);
    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (current.count >= max) {
      res.status(429).json({ error: "Too Many Requests" });
      return;
    }
    current.count += 1;
    next();
  };
}
