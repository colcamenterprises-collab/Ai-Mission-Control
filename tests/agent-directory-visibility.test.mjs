import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("business-specific departments cannot break the whole agent directory", async () => {
  const route = await read("artifacts/api-server/src/routes/agents.ts");
  assert.match(route, /department: z\.string\(\)\.trim\(\)\.min\(1\)/);
  assert.match(route, /const ListAgentsResponse = z\.array\(AgentResponse\)/);
  assert.match(route, /res\.json\(ListAgentsResponse\.parse/);
  assert.doesNotMatch(route, /Finance.*Operators|Developers.*Writers.*Researchers.*Operators/s);
});

test("agent create and update accept real business departments", async () => {
  const route = await read("artifacts/api-server/src/routes/agents.ts");
  assert.match(route, /const CreateAgentRequest = CreateAgentBody\.extend/);
  assert.match(route, /const UpdateAgentRequest = UpdateAgentBody\.extend/);
  assert.match(route, /CreateAgentRequest\.safeParse/);
  assert.match(route, /UpdateAgentRequest\.safeParse/);
});

test("AI Team dashboard metric counts hired agents including idle-ready employees", async () => {
  const dashboard = await read("artifacts/api-server/src/routes/dashboard.ts");
  const marker = dashboard.indexOf("const [activeAgentCount]");
  assert.ok(marker >= 0, "dashboard must calculate AI Team count");
  const block = dashboard.slice(marker, dashboard.indexOf("const [recentActivityCount]"));
  assert.match(block, /from\(agentsTable\)/);
  assert.doesNotMatch(block, /status.*active/);
});
