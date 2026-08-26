#!/usr/bin/env node

const baseUrl = (
  process.env.MISSION_CONTROL_SMOKE_BASE_URL ?? "http://127.0.0.1:3000"
).replace(/\/+$/, "");
const token =
  process.env.MISSION_CONTROL_ADMIN_TOKEN ??
  process.env.VITE_MISSION_CONTROL_ADMIN_TOKEN ??
  "";
const sendJamesMessage = process.env.MISSION_CONTROL_SMOKE_SEND_JAMES === "1";

const authHeaders = token ? { Authorization: `Bearer ${token}`, "x-admin-token": token } : {};

const checks = [
  { name: "API liveness", path: "/api/healthz", auth: false },
  {
    name: "Operational readiness",
    path: "/api/readyz",
    auth: false,
    validate(payload) {
      if (!payload || payload.status !== "ready") throw new Error(`readiness status is ${payload?.status ?? "missing"}`);
      if (!Array.isArray(payload.checks) || payload.checks.some((check) => check.status === "fail")) throw new Error("one or more readiness checks failed");
      if (!payload.totals || Number(payload.totals.routableAgents ?? 0) < 1) throw new Error("no routable AI employee is available");
    },
  },
  { name: "Team/agents", path: "/api/agents", auth: true, validate(payload) { if (!Array.isArray(payload) || payload.length < 1) throw new Error("agent directory is empty"); } },
  { name: "Tasks", path: "/api/tasks", auth: true },
  { name: "Inbox", path: "/api/inbox", auth: true },
  { name: "Executions", path: "/api/executions", auth: true },
  { name: "Approvals", path: "/api/approvals", auth: true },
  { name: "Employee provisioning", path: "/api/provisioning/overview", auth: true },
  { name: "Employee profiles", path: "/api/employee-factory/profiles", auth: true },
  { name: "Skills", path: "/api/skills", auth: true },
  { name: "Memory", path: "/api/memories", auth: true },
  { name: "Calendar", path: "/api/events", auth: true },
  { name: "Content", path: "/api/content", auth: true },
  { name: "Contacts", path: "/api/contacts", auth: true },
  { name: "James status", path: "/api/james/status", auth: true },
  { name: "James jobs status", path: "/api/james/jobs", auth: true },
  { name: "Worktrees diagnostics", path: "/api/worktrees/diagnostics", auth: true },
];

if (sendJamesMessage) {
  checks.push({
    name: "James message",
    path: "/api/james/message",
    auth: true,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Operational smoke test. Reply with current James execution status only." }),
    },
  });
}

function formatSmokeBody(text, contentType) {
  const trimmed = text.trim();
  if (!trimmed) return "<empty response body>";
  if (contentType.includes("application/json")) {
    try { return JSON.stringify(JSON.parse(trimmed), null, 2); } catch { return trimmed.slice(0, 1000); }
  }
  if (contentType.includes("text/html") || /^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    const plainText = trimmed.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return plainText.slice(0, 1000) || "HTML response body was not readable as text";
  }
  return trimmed.slice(0, 1000);
}

let failures = 0;
for (const check of checks) {
  const url = `${baseUrl}${check.path}`;
  const headers = { Accept: "application/json", ...(check.init?.headers ?? {}), ...(check.auth ? authHeaders : {}) };
  if (check.auth && !token) {
    failures += 1;
    console.log(`FAIL ${check.name}: missing MISSION_CONTROL_ADMIN_TOKEN`);
    continue;
  }
  try {
    const response = await fetch(url, { ...(check.init ?? {}), headers });
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const acceptedStatuses = check.acceptedStatuses ?? new Set([200]);
    if (!acceptedStatuses.has(response.status)) {
      failures += 1;
      console.log(`FAIL ${check.name}: HTTP ${response.status} ${response.statusText}\n${formatSmokeBody(text, contentType)}`);
      continue;
    }
    const payload = text.trim() ? JSON.parse(text) : null;
    check.validate?.(payload);
    console.log(`PASS ${check.name}: HTTP ${response.status}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${check.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures > 0) {
  console.error(`Operational smoke failed: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("Operational smoke passed: Mission Control critical operating surfaces are usable.");
