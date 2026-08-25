import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("employee factory uses registered projects rather than a hard-coded business", async () => {
  const page = await read("artifacts/mission-control/src/pages/agent-creation.tsx");
  assert.match(page, /\/api\/employee-factory\/projects/);
  assert.match(page, /Choose a Mission Control project/);
  assert.doesNotMatch(page, /business: "Smash Brothers Burgers"/);
  assert.doesNotMatch(page, /name: "Amanda"/);
});

test("employee factory offers runtime choices honestly", async () => {
  const page = await read("artifacts/mission-control/src/pages/agent-creation.tsx");
  assert.match(page, />OpenClaw</);
  assert.match(page, />Hermes</);
  assert.match(page, />Connect existing agent</);
  assert.match(page, /No existing agent required/);
  assert.match(page, /one-click provisioning is not implemented yet/);
});

test("new employees start without Mission Control skills", async () => {
  const [page, config, schema] = await Promise.all([
    read("artifacts/mission-control/src/pages/agent-creation.tsx"),
    read("artifacts/api-server/src/config-operational-agents.ts"),
    read("lib/db/src/ensure-agent-provisioning-schema.ts"),
  ]);
  assert.match(page, /Starts with no Mission Control skills/);
  assert.match(page, /0 Mission Control skills/);
  assert.match(config, /openclaw: \[\]/);
  assert.match(schema, /'\[\]'::jsonb/);
});

test("employee photo and project profile are persisted server-side", async () => {
  const [route, schema, page] = await Promise.all([
    read("artifacts/api-server/src/routes/employee-factory.ts"),
    read("lib/db/src/ensure-agent-provisioning-schema.ts"),
    read("artifacts/mission-control/src/pages/agent-creation.tsx"),
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS agent_employee_profiles/);
  assert.match(route, /avatar_data_url/);
  assert.match(route, /project_id/);
  assert.match(route, /\/employee-factory\/hire/);
  assert.match(page, /accept="image\/png,image\/jpeg,image\/webp"/);
});

test("hire failures remain visible beside the hire button", async () => {
  const [page, css] = await Promise.all([
    read("artifacts/mission-control/src/pages/agent-creation.tsx"),
    read("artifacts/mission-control/src/pages/employee-factory.css"),
  ]);
  assert.match(page, /setHireError\(message\);/);
  assert.match(page, /load\(\{ preserveMessages: true \}\)/);
  assert.match(page, /employee-hire-status/);
  assert.match(page, /Hiring .*Mission Control is creating the employee/);
  assert.match(css, /employee-hire-bar\.hire-error/);
  assert.match(css, /employee-hire-status/);
});

test("successful hire confirms readiness then opens AI Team", async () => {
  const page = await read("artifacts/mission-control/src/pages/agent-creation.tsx");
  assert.match(page, /is hired and connected\. Opening AI Team now/);
  assert.match(page, /window\.location\.assign\("\/team"\)/);
  assert.match(page, /Hiring…/);
});
