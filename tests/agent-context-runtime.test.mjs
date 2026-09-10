import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contextSource = await readFile(new URL("../artifacts/api-server/src/services/agent-context.ts", import.meta.url), "utf8");
const runtimeSource = await readFile(new URL("../artifacts/api-server/src/services/agent-runtime.ts", import.meta.url), "utf8");
const rootContext = await readFile(new URL("../CONTEXT.md", import.meta.url), "utf8");
const rootAgents = await readFile(new URL("../AGENTS.md", import.meta.url), "utf8");

const directions = {
  james: await readFile(new URL("../docs/mission-control/employees/JAMES_HERMES.md", import.meta.url), "utf8"),
  amanda: await readFile(new URL("../docs/mission-control/employees/AMANDA_FINANCIAL_CONTROLLER_DIRECTION.md", import.meta.url), "utf8"),
  justin: await readFile(new URL("../docs/mission-control/employees/JUSTIN_OPERATIONS_MANAGER.md", import.meta.url), "utf8"),
  analyst: await readFile(new URL("../docs/mission-control/employees/AI_INTELLIGENCE_ANALYST_DIRECTION.md", import.meta.url), "utf8"),
};

test("canonical company context encodes the owner-approved operating rule", () => {
  assert.match(rootContext, /Scale fast, but safely/i);
  assert.match(rootContext, /ordinary, reversible business and process decisions/i);
  assert.match(rootAgents, /L3 — owner authority/i);
  assert.match(rootAgents, /Amanda and Justin are in staged internal-communication certification/i);
});

test("all four employee directions are mapped into canonical runtime context", () => {
  assert.match(contextSource, /JAMES_HERMES\.md/);
  assert.match(contextSource, /AMANDA_FINANCIAL_CONTROLLER_DIRECTION\.md/);
  assert.match(contextSource, /JUSTIN_OPERATIONS_MANAGER\.md/);
  assert.match(contextSource, /AI_INTELLIGENCE_ANALYST_DIRECTION\.md/);
  assert.match(directions.james, /verified outcomes/i);
  assert.match(directions.amanda, /sales, expenses and finance/i);
  assert.match(directions.justin, /theoretical stock usage/i);
  assert.match(directions.analyst, /Everything else is noise/i);
});

test("runtime dispatch injects canonical context once and OpenClaw receives prompt plus workspace context", () => {
  assert.match(runtimeSource, /const canonicalContext = await buildCanonicalAgentContext\(agent\.id\)/);
  assert.match(runtimeSource, /const runtimeInput = canonicalContext/);
  assert.match(runtimeSource, /return await dispatchOpenClaw\(agent, runtimeInput, policy\)/);
  assert.match(runtimeSource, /message: buildPrompt\(input\)/);
  assert.doesNotMatch(runtimeSource, /const canonicalContext = await buildCanonicalAgentContext\(agent\.id\).*const mergedContext/s);
  assert.match(runtimeSource, /syncCanonicalContextToWorkspace\(agent\.id\)/);
  assert.match(contextSource, /fs\.writeFile\(path\.join\(resolved, "CONTEXT\.md"\)/);
  assert.match(contextSource, /Live Employment Pack/);
  assert.match(runtimeSource, /export function isRuntimeConfigured/);
});

test("certification runtimes have bounded but realistic test-mode time budgets", () => {
  assert.match(runtimeSource, /TEST_PROVIDER_TIMEOUT_MS = 30_000/);
  assert.match(runtimeSource, /TEST_WEBHOOK_TIMEOUT_MS = 45_000/);
  assert.match(runtimeSource, /TEST_OPENCLAW_TIMEOUT_SECONDS = 60/);
  assert.match(runtimeSource, /input\.mode === "test" \? TEST_WEBHOOK_TIMEOUT_MS : 30_000/);
  assert.match(runtimeSource, /input\.mode === "test" \? TEST_OPENCLAW_TIMEOUT_SECONDS : 600/);
});
