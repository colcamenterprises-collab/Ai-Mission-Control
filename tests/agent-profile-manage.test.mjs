import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("agent profile schema is durable and additive", async () => {
  const source = await read("lib/db/src/ensure-agent-provisioning-schema.ts");
  assert.match(source, /CREATE TABLE IF NOT EXISTS agent_profile_definitions/);
  assert.match(source, /profile_json jsonb/);
  assert.match(source, /generated_files jsonb/);
});

test("agent profile API generates portable markdown without credentials", async () => {
  const source = await read("artifacts/api-server/src/routes/agent-profile.ts");
  for (const file of ["IDENTITY.md", "SOUL.md", "AGENTS.md", "USER.md", "TOOLS.md", "HEARTBEAT.md", "MEMORY.md"]) {
    assert.match(source, new RegExp(file.replace(".", "\\.")));
  }
  assert.match(source, /credentialsIncluded: false/);
  assert.match(source, /assertManagedWorkspace/);
  assert.match(source, /profileCompleteness/);
});

test("team manage modal exposes agent profile sections and keeps health out of chat", async () => {
  const panel = await read("artifacts/mission-control/src/pages/agent-profile-panel.tsx");
  const team = await read("artifacts/mission-control/src/pages/team-unified.tsx");
  for (const label of ["Overview", "Identity & Soul", "Skills", "Memory", "Knowledge", "Tools & Access", "Automations", "Activity", "Chat", "Export"]) {
    assert.match(panel, new RegExp(label.replace("&", "&")));
  }
  assert.match(panel, /setHealth\(\{ ok: true, text \}\)/);
  assert.doesNotMatch(panel, /appendChat.*Connection/);
  assert.match(team, /<AgentProfilePanel/);
});

test("questionnaire answers remain the source record and save syncs workspace markdown", async () => {
  const api = await read("artifacts/api-server/src/routes/agent-profile.ts");
  const panel = await read("artifacts/mission-control/src/pages/agent-profile-panel.tsx");
  assert.match(api, /profile_json = EXCLUDED.profile_json/);
  assert.match(api, /fs\.writeFile\(path\.join\(bundle\.workspacePath!/);
  assert.match(panel, /Save & sync agent/);
  assert.match(panel, /What is this employee's mission\?/);
  assert.match(panel, /What must they never do\?/);
});
