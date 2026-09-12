import crypto from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { intakeExternalTask } from "../services/external-intake.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}
function signature(req: Request): string {
  const value =
    req.header("x-hub-signature-256") ?? req.header("x-signature") ?? "";
  return value.replace(/^sha256=/i, "").trim();
}
function verify(req: Request): boolean {
  const secret = env("MISSION_CONTROL_WHATSAPP_WEBHOOK_SECRET");
  if (!secret) return false;
  const supplied = signature(req);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const body = JSON.stringify(req.body ?? {});
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(supplied, "hex"),
    Buffer.from(expected, "hex"),
  );
}
function firstString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function eventFields(body: any) {
  const payload = body?.payload ?? body?.data ?? body?.event ?? body ?? {};
  const message = payload?.message ?? payload?.data ?? payload;
  return {
    event:
      firstString(body?.event) ||
      firstString(body?.event_type) ||
      firstString(payload?.event),
    id:
      firstString(message?.id) ||
      firstString(message?.message_id) ||
      firstString(payload?.id),
    chat:
      firstString(message?.chat_jid) ||
      firstString(message?.chat) ||
      firstString(message?.from) ||
      firstString(payload?.chat_jid),
    sender:
      firstString(message?.sender_jid) ||
      firstString(message?.sender) ||
      firstString(payload?.sender_jid),
    text:
      firstString(message?.content) ||
      firstString(message?.text) ||
      firstString(message?.body) ||
      firstString(payload?.content),
    fromMe: Boolean(
      message?.is_from_me ?? message?.from_me ?? payload?.is_from_me,
    ),
  };
}

async function sendWhatsApp(chat: string, text: string): Promise<void> {
  const response = await fetch(
    `${env("MISSION_CONTROL_WHATSAPP_BASE_URL") || "http://127.0.0.1:3000"}/send/message`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id":
          env("MISSION_CONTROL_WHATSAPP_DEVICE_ID") || "mission-control",
      },
      body: JSON.stringify({ phone: chat, message: text }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok)
    throw new Error(
      `GoWA send failed HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
}

router.post("/whatsapp/webhook", async (req, res): Promise<void> => {
  if (!verify(req)) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }
  const msg = eventFields(req.body);
  const allowedChat = env("MISSION_CONTROL_WHATSAPP_ALLOWED_CHAT_JID");
  if (!allowedChat || msg.chat !== allowedChat) {
    res.status(202).json({ accepted: false, reason: "chat_not_allowed" });
    return;
  }
  if (msg.fromMe || !msg.text) {
    res
      .status(202)
      .json({ accepted: false, reason: msg.fromMe ? "from_me" : "no_text" });
    return;
  }
  if (!msg.id) {
    res.status(400).json({ accepted: false, reason: "message_id_required" });
    return;
  }

  try {
    const intake = await intakeExternalTask({
      source: {
        channel: "whatsapp",
        externalId: msg.id,
        senderId: msg.sender || null,
        conversationId: msg.chat,
      },
      text: msg.text,
      project: "Mission Control",
    });

    res.status(intake.created ? 202 : 200).json({
      accepted: true,
      duplicate: intake.duplicatePrevented,
      taskId: intake.task.id,
      requestId: intake.request.id,
      state: intake.request.state,
      riskLevel: intake.request.riskLevel,
      approvalDecision: intake.request.approvalDecision,
      assignedAgent: intake.assignedAgentName,
    });

    const gate =
      intake.request.approvalDecision === "OWNER_APPROVAL"
        ? "Owner approval is required before execution."
        : intake.request.approvalDecision === "ORCHESTRATOR_APPROVAL"
          ? "James will authorize the controlled action before execution."
          : "It is queued under standing delegation.";
    void sendWhatsApp(
      allowedChat,
      `Mission Control: ${intake.duplicatePrevented ? "Request already received" : "Request received"} as Task #${intake.task.id} / Work Request #${intake.request.id}. Assigned to ${intake.assignedAgentName}. ${gate}`,
    ).catch((error) =>
      logger.error(
        { err: error, messageId: msg.id, requestId: intake.request.id },
        "WhatsApp acknowledgement send failed",
      ),
    );
  } catch (error) {
    logger.error(
      { err: error, messageId: msg.id },
      "WhatsApp canonical intake failed",
    );
    res.status(500).json({ accepted: false, error: "canonical_intake_failed" });
  }
});

export default router;
