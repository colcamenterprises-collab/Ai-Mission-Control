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
  assert.match(source, /shared-company-capability/);
});

test("team manage modal focuses employee setup on identity, work and audit surfaces", async () => {
  const panel = await read("artifacts/mission-control/src/pages/agent-profile-panel.tsx");
  const hardening = await read("artifacts/mission-control/src/pages/agent-profile-hardening.css");
  const team = await read("artifacts/mission-control/src/pages/team-unified.tsx");
  for (const label of ["Overview", "Identity & Soul", "Activity", "Chat", "Export"]) {
    assert.match(panel, new RegExp(label));
  }
  assert.doesNotMatch(panel, /\["automations", "Automations"/);
  assert.doesNotMatch(panel, /What should this employee check or do repeatedly\?/);
  assert.doesNotMatch(panel, /What should trigger an alert\?/);
  assert.match(hardening, /Skills, memory,/);
  assert.match(hardening, /nth-child\(3\)/);
  assert.match(hardening, /nth-child\(6\)/);
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

test("profile completeness excludes shared infrastructure and recurring task configuration", async () => {
  const api = await read("artifacts/api-server/src/routes/agent-profile.ts");
  const completeness = api.slice(api.indexOf("function profileCompleteness"), api.indexOf("function assertManagedWorkspace"));
  assert.doesNotMatch(completeness, /profile\.tools/);
  assert.doesNotMatch(completeness, /profile\.memory/);
  assert.doesNotMatch(completeness, /profile\.heartbeat/);
});

test("recurring work is defined only by canonical Mission Control tasks", async () => {
  const api = await read("artifacts/api-server/src/routes/agent-profile.ts");
  assert.match(api, /Recurring work, schedules, triggers and alerts are not defined in an employee profile/);
  assert.match(api, /canonical Mission Control tasks/);
  const heartbeatMarkdown = api.slice(api.indexOf('"HEARTBEAT.md"'), api.indexOf('"MEMORY.md"'));
  assert.doesNotMatch(heartbeatMarkdown, /profile\.heartbeat\.recurringDuties/);
  assert.doesNotMatch(heartbeatMarkdown, /profile\.heartbeat\.alertConditions/);
});
