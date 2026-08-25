import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("OpenClaw identity uses canonical parsed fields and an explicit identity file", async () => {
  const source = await read("artifacts/api-server/src/services/agent-provisioner.ts");

  assert.match(source, /- Name: \$\{identityField\(values\.name\)\}/);
  assert.match(source, /- Theme: \$\{identityField\(theme\)\}/);
  assert.match(source, /- Emoji: 🤖/);
  assert.match(source, /"--identity-file", identityPath/);
  assert.match(source, /"--from-identity"/);
  assert.doesNotMatch(source, /const identity = template\?\.identityTemplate/);
});

test("OpenClaw host certification requires an already healthy shared gateway", async () => {
  const source = await read("artifacts/api-server/src/services/agent-provisioner.ts");

  assert.match(source, /\["--version"\]/);
  assert.match(source, /\["config", "validate"\]/);
  assert.match(source, /\["models", "status", "--check"\]/);
  assert.match(source, /requireGatewayReady/);
  assert.match(source, /\["gateway", "status", "--require-rpc"\]/);
  assert.match(source, /\["health", "--json"\]/);
  assert.match(source, /shared gateway is not healthy/);

  assert.doesNotMatch(source, /\["gateway", "restart"/);
  assert.doesNotMatch(source, /\["gateway", "install"/);
  assert.doesNotMatch(source, /\["gateway", "start"/);
});

test("OpenClaw employee is not marked ready until a real agent turn succeeds", async () => {
  const source = await read("artifacts/api-server/src/services/agent-provisioner.ts");

  assert.match(source, /certifyProvisionedAgent/);
  assert.match(source, /"models", "status", "--agent", runtimeAgentId, "--check"/);
  assert.match(source, /"agent",\s*\n\s*"--agent", runtimeAgentId/);
  assert.match(source, /OPENCLAW_CERTIFICATION_MESSAGE/);
  assert.match(source, /runtime certified and provisioned/);
  assert.match(source, /cleanupRuntimeArtifacts/);
  assert.match(source, /cleanupFailedDatabaseAttempt/);
});

test("OpenClaw employee restart re-certifies only that employee and never restarts the shared gateway", async () => {
  const source = await read("artifacts/api-server/src/services/agent-provisioner.ts");

  assert.match(source, /if \(action === "restart"\)/);
  assert.match(source, /employee re-certified by owner/);
  assert.match(source, /certifyProvisionedAgent\(cliPath, env, host\.rootDir, instance\.runtimeAgentId\)/);
  assert.doesNotMatch(source, /gateway", "restart/);
});
