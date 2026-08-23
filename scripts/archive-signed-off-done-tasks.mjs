#!/usr/bin/env node

/**
 * One-time safe reconciliation for historical tasks that are already Done and
 * contain explicit owner acceptance evidence. Ambiguous Done tasks are left alone.
 *
 * Uses Mission Control's existing archive endpoint so project archive snapshots,
 * task history and attachment metadata are preserved by the canonical code path.
 *
 * Usage on the production host after deploy:
 *   MISSION_CONTROL_ADMIN_TOKEN=... node scripts/archive-signed-off-done-tasks.mjs
 */
const token = process.env.MISSION_CONTROL_ADMIN_TOKEN;
const baseUrl = process.env.MISSION_CONTROL_LOCAL_API ?? "http://127.0.0.1:4100/api";

if (!token) {
  console.error("STOP: MISSION_CONTROL_ADMIN_TOKEN is required");
  process.exit(1);
}

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
  "x-admin-token": token,
};

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method ?? "GET"} ${path} -> HTTP ${response.status}: ${body}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

const tasks = await request("/tasks");
const candidates = [];

for (const task of tasks) {
  if (task.status !== "done" || task.archivedAt) continue;
  const details = await request(`/tasks/${task.id}/details`);
  const signedOff = (details.messages ?? []).some((message) => {
    const body = String(message.body ?? "").trim().toUpperCase();
    return body.startsWith("OWNER ACCEPTED") || body.startsWith("APPROVED — APPROVED DIRECTLY FROM THE KANBAN CARD");
  });
  if (signedOff) candidates.push(task);
}

if (!candidates.length) {
  console.log("PASS: no explicitly signed-off Done tasks require archival");
  process.exit(0);
}

console.log(`Found ${candidates.length} explicitly signed-off Done task(s).`);

for (const task of candidates) {
  await request(`/tasks/${task.id}/archive`, { method: "POST", body: "{}" });
  console.log(`ARCHIVED #${task.id}: ${task.title}`);
}

console.log("PASS: historical signed-off Done reconciliation complete");
