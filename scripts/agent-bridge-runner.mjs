#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const API_BASE = normalizeBaseUrl(process.env.MISSION_CONTROL_API_BASE ?? "http://127.0.0.1:4100/api");
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? process.env.MISSION_CONTROL_AGENT_TOKEN ?? "";
const AGENT_ID = Number(process.env.AGENT_ID ?? process.env.MISSION_CONTROL_AGENT_ID ?? "0");
const WORK_DIR = process.env.AGENT_WORK_DIR ?? path.join(process.cwd(), "agent-inbox");
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? "15000");
const ONCE = process.argv.includes("--once") || process.env.AGENT_BRIDGE_ONCE === "true";

if (!AGENT_TOKEN) {
  console.error("Missing AGENT_TOKEN. Generate an agent token in Mission Control > Agents and export it before running.");
  process.exit(1);
}

if (!Number.isFinite(AGENT_ID) || AGENT_ID <= 0) {
  console.error("Missing AGENT_ID. Set AGENT_ID to the numeric agent id shown in Mission Control.");
  process.exit(1);
}

await mkdir(WORK_DIR, { recursive: true });

console.log("Mission Control agent bridge starting");
console.log(`API: ${API_BASE}`);
console.log(`Agent ID: ${AGENT_ID}`);
console.log(`Inbox: ${WORK_DIR}`);
console.log(ONCE ? "Mode: once" : `Mode: loop every ${POLL_INTERVAL_MS}ms`);

async function main() {
  do {
    try {
      await pollOnce();
    } catch (error) {
      console.error(`[bridge] ${formatError(error)}`);
    }

    if (!ONCE) await sleep(POLL_INTERVAL_MS);
  } while (!ONCE);
}

async function pollOnce() {
  const ping = await api("/agent/ping", {
    method: "POST",
    body: JSON.stringify({ agentId: AGENT_ID }),
  });

  const commands = Array.isArray(ping.pendingCommands) ? ping.pendingCommands : [];
  console.log(`[${new Date().toISOString()}] ${ping.name ?? "agent"}: ${commands.length} pending command(s)`);

  for (const command of commands) {
    await saveCommand(command);
    await ackCommand(command.id);
    await reportActivity(command);
    console.log(`Command #${command.id} written and acknowledged`);
  }
}

async function saveCommand(command) {
  const commandId = Number(command.id);
  const safeCreatedAt = String(command.createdAt ?? new Date().toISOString()).replace(/[:.]/g, "-");
  const baseName = `command-${String(commandId).padStart(5, "0")}-${safeCreatedAt}`;
  const jsonPath = path.join(WORK_DIR, `${baseName}.json`);
  const mdPath = path.join(WORK_DIR, `${baseName}.md`);

  if (existsSync(jsonPath) || existsSync(mdPath)) return;

  const jsonPayload = {
    id: commandId,
    taskId: command.taskId ?? null,
    createdAt: command.createdAt ?? null,
    instructions: command.instructions ?? "",
    context: parseContext(command.context),
    receivedAt: new Date().toISOString(),
    host: os.hostname(),
  };

  const markdown = [
    `# Mission Control Command #${commandId}`,
    "",
    `Task ID: ${command.taskId ?? "none"}`,
    `Received: ${jsonPayload.receivedAt}`,
    `Host: ${jsonPayload.host}`,
    "",
    "## Instructions",
    "",
    command.instructions ?? "",
    "",
    "## Context",
    "",
    typeof jsonPayload.context === "string" ? jsonPayload.context : JSON.stringify(jsonPayload.context, null, 2),
    "",
    "## Agent notes",
    "",
    "- Review the command.",
    "- Execute only safe, approved actions.",
    "- Report progress back through POST /api/agent/report.",
    "",
  ].join("\n");

  await writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2));
  await writeFile(mdPath, markdown);
}

async function ackCommand(commandId) {
  await api(`/agent/command/${commandId}/ack`, { method: "POST" });
}

async function reportActivity(command) {
  await api("/agent/report", {
    method: "POST",
    body: JSON.stringify({
      type: "activity",
      taskId: command.taskId ?? null,
      content: `Command #${command.id} received by ${os.hostname()} and written to ${WORK_DIR}.`,
    }),
  });
}

async function api(route, init = {}) {
  const response = await fetch(`${API_BASE}${route}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGENT_TOKEN}`,
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const payload = text ? safeJson(text) : {};

  if (!response.ok) {
    throw new Error(`${route} failed with HTTP ${response.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }

  return payload;
}

function parseContext(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

main();
