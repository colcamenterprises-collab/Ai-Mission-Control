#!/usr/bin/env node

const baseUrl = (
  process.env.MISSION_CONTROL_SMOKE_BASE_URL ?? "http://127.0.0.1:3000"
).replace(/\/+$/, "");
const token =
  process.env.MISSION_CONTROL_ADMIN_TOKEN ??
  process.env.VITE_MISSION_CONTROL_ADMIN_TOKEN ??
  "";
const sendJamesMessage = process.env.MISSION_CONTROL_SMOKE_SEND_JAMES === "1";

const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

const checks = [
  { name: "API server", path: "/api/healthz", auth: false },
  { name: "James status", path: "/api/james/status", auth: true },
  {
    name: "Worktrees diagnostics",
    path: "/api/worktrees/diagnostics",
    auth: true,
  },
  { name: "Tasks", path: "/api/tasks", auth: true },
  { name: "Content", path: "/api/content", auth: true },
  { name: "Calendar", path: "/api/events", auth: true },
  { name: "Memory", path: "/api/memories", auth: true },
  { name: "Team/agents", path: "/api/agents", auth: true },
  { name: "Contacts", path: "/api/contacts", auth: true },
  { name: "James jobs status", path: "/api/james/jobs", auth: true },
];

if (sendJamesMessage) {
  checks.push({
    name: "James message",
    path: "/api/james/message",
    auth: true,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          "Operational smoke test. Reply with current James execution status only.",
      }),
    },
  });
  checks.push({
    name: "James background job start",
    path: "/api/james/jobs",
    auth: true,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Operational background smoke test. Report status only.",
      }),
    },
    acceptedStatuses: new Set([200, 202]),
  });
}

let failures = 0;

for (const check of checks) {
  const url = `${baseUrl}${check.path}`;
  const headers = {
    Accept: "application/json",
    ...(check.init?.headers ?? {}),
    ...(check.auth ? authHeaders : {}),
  };

  if (check.auth && !token) {
    failures += 1;
    console.log(`FAIL ${check.name}: missing MISSION_CONTROL_ADMIN_TOKEN`);
    continue;
  }

  try {
    const response = await fetch(url, { ...(check.init ?? {}), headers });
    const text = await response.text();
    const acceptedStatuses = check.acceptedStatuses ?? new Set([200]);

    if (!acceptedStatuses.has(response.status)) {
      failures += 1;
      console.log(
        `FAIL ${check.name}: HTTP ${response.status} ${response.statusText} ${text.slice(0, 300)}`,
      );
      continue;
    }

    if (text.trim()) JSON.parse(text);
    console.log(`PASS ${check.name}: HTTP ${response.status}`);
  } catch (error) {
    failures += 1;
    console.log(
      `FAIL ${check.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (failures > 0) {
  console.error(`Operational smoke failed: ${failures} check(s) failed.`);
  process.exit(1);
}

console.log("Operational smoke passed.");
