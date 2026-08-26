import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("business-specific departments cannot break the whole agent directory", async () => {
  const route = await read("artifacts/api-server/src/routes/agents.ts");
  assert.match(route, /normalizeDepartment/);
  assert.match(route, /res\.json\(serializeDates\(agents\.map\(maskAgentForResponse\)\)\)/);
  assert.doesNotMatch(route, /ListAgentsResponse\.parse/);
  assert.doesNotMatch(route, /Finance.*Operators|Developers.*Writers.*Researchers.*Operators/s);
});

test("agent create and update accept real business departments without weakening other validation", async () => {
  const route = await read("artifacts/api-server/src/routes/agents.ts");
  assert.match(route, /CreateAgentBody\.safeParse\(\{ \.\.\.req\.body, department: LEGACY_DEPARTMENT_PLACEHOLDER \}\)/);
  assert.match(route, /UpdateAgentBody\.safeParse/);
  assert.match(route, /department must be a non-empty string/);
  assert.match(route, /const rest = \{ \.\.\.validated, department \}/);
});

test("AI Team dashboard metric counts hired agents including idle-ready employees", async () => {
  const dashboard = await read("artifacts/api-server/src/routes/dashboard.ts");
  const marker = dashboard.indexOf("const [activeAgentCount]");
  assert.ok(marker >= 0, "dashboard must calculate AI Team count");
  const block = dashboard.slice(marker, dashboard.indexOf("const [recentActivityCount]"));
  assert.match(block, /from\(agentsTable\)/);
  assert.doesNotMatch(block, /status.*active/);
});
