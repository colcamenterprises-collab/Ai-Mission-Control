import crypto from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { asc, eq, or, ilike } from "drizzle-orm";
import { db, agentsTable } from "@workspace/db";
import { dispatchRuntime } from "../services/agent-runtime.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
const seen = new Map<string, number>();
const SEEN_TTL_MS = 24 * 60 * 60 * 1000;

function env(name: string): string { return process.env[name]?.trim() ?? ""; }
function signature(req: Request): string {
  const value = req.header("x-hub-signature-256") ?? req.header("x-signature") ?? "";
  return value.replace(/^sha256=/i, "").trim();
}
function verify(req: Request): boolean {
  const secret = env("MISSION_CONTROL_WHATSAPP_WEBHOOK_SECRET");
  if (!secret) return false;
  const supplied = signature(req);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const body = JSON.stringify(req.body ?? {});
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}
function firstString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}
function eventFields(body: any) {
  const payload = body?.payload ?? body?.data ?? body?.event ?? body ?? {};
  const message = payload?.message ?? payload?.data ?? payload;
  return {
    event: firstString(body?.event) || firstString(body?.event_type) || firstString(payload?.event),
    id: firstString(message?.id) || firstString(message?.message_id) || firstString(payload?.id),
    chat: firstString(message?.chat_jid) || firstString(message?.chat) || firstString(message?.from) || firstString(payload?.chat_jid),
    sender: firstString(message?.sender_jid) || firstString(message?.sender) || firstString(payload?.sender_jid),
    text: firstString(message?.content) || firstString(message?.text) || firstString(message?.body) || firstString(payload?.content),
    fromMe: Boolean(message?.is_from_me ?? message?.from_me ?? payload?.is_from_me),
  };
}
function isDuplicate(id: string): boolean {
  const now = Date.now();
  for (const [key, at] of seen) if (now - at > SEEN_TTL_MS) seen.delete(key);
  if (!id) return false;
  if (seen.has(id)) return true;
  seen.set(id, now);
  return false;
}
async function sendWhatsApp(chat: string, text: string): Promise<void> {
  const response = await fetch(`${env("MISSION_CONTROL_WHATSAPP_BASE_URL") || "http://127.0.0.1:3000"}/send/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": env("MISSION_CONTROL_WHATSAPP_DEVICE_ID") || "mission-control" },
    body: JSON.stringify({ phone: chat, message: text }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`GoWA send failed HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
}
async function routeAgent(text: string) {
  const lower = text.toLowerCase();
  const wantsAmanda = /^\s*(amanda\b|@amanda\b)/i.test(text) || /\b(finance|financial|reconcil|expense|bank|cash|invoice|payment)\b/i.test(lower);
  const rows = await db.select().from(agentsTable)
    .where(wantsAmanda
      ? or(ilike(agentsTable.name, "%amanda%"), ilike(agentsTable.role, "%financial controller%"))
      : or(ilike(agentsTable.name, "%james%"), ilike(agentsTable.role, "%orchestr%")))
    .orderBy(asc(agentsTable.id)).limit(1);
  return rows[0] ?? null;
}

router.post("/whatsapp/webhook", async (req, res): Promise<void> => {
  if (!verify(req)) { res.status(401).json({ error: "Invalid webhook signature" }); return; }
  const msg = eventFields(req.body);
  const allowedChat = env("MISSION_CONTROL_WHATSAPP_ALLOWED_CHAT_JID");
  if (!allowedChat || msg.chat !== allowedChat) { res.status(202).json({ accepted: false, reason: "chat_not_allowed" }); return; }
  if (msg.fromMe || !msg.text) { res.status(202).json({ accepted: false, reason: msg.fromMe ? "from_me" : "no_text" }); return; }
  if (isDuplicate(msg.id)) { res.status(200).json({ accepted: true, duplicate: true }); return; }
  res.status(202).json({ accepted: true });
  void (async () => {
    try {
      const agent = await routeAgent(msg.text);
      if (!agent) throw new Error("No WhatsApp routing agent found");
      const result = await dispatchRuntime(agent, {
        instructions: `Reply to this WhatsApp message as ${agent.name}. Keep the response concise and operational. Message: ${msg.text}`,
        context: `Source: approved WhatsApp group. Sender JID: ${msg.sender || "unknown"}. Message ID: ${msg.id || "unknown"}.`,
        mode: "work",
      });
      const reply = result.output?.trim();
      if (!result.ok || !reply) throw new Error(result.error || "Agent returned no reply");
      await sendWhatsApp(allowedChat, `${agent.name}: ${reply.slice(0, 3500)}`);
    } catch (error) { logger.error({ err: error, messageId: msg.id }, "WhatsApp bridge processing failed"); }
  })();
});

export default router;
