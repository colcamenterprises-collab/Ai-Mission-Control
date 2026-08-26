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

test("OpenClaw live certification accepts documented successful gateway response shapes", async () => {
  const source = await read("artifacts/api-server/src/services/agent-provisioner.ts");

  assert.match(source, /function hasLiveInferencePayload/);
  assert.match(source, /if \(value\.ok === true\) return true/);
  assert.match(source, /isNonEmptyText\(value\.final\)/);
  assert.match(source, /Array\.isArray\(value\.payloads\)/);
  assert.match(source, /value\.result && typeof value\.result === "object"/);
  assert.doesNotMatch(source, /!\("ok" in parsed\)/);
  assert.doesNotMatch(source, /\(parsed as \{ ok\?: unknown \}\)\.ok !== true/);
});

test("OpenClaw live certification rejects explicit failure, timeout and in-flight outcomes", async () => {
  const source = await read("artifacts/api-server/src/services/agent-provisioner.ts");

  assert.match(source, /"error", "failed", "cancelled", "canceled", "timeout", "timed_out", "in_flight"/);
  assert.match(source, /if \(value\.error\) return false/);
  assert.match(source, /if \(result\.error\) return false/);
  assert.match(source, /returned no successful response payload/);
});

test("OpenClaw employee restart re-certifies only that employee and never restarts the shared gateway", async () => {
  const source = await read("artifacts/api-server/src/services/agent-provisioner.ts");

  assert.match(source, /if \(action === "restart"\)/);
  assert.match(source, /employee re-certified by owner/);
  assert.match(source, /certifyProvisionedAgent\(cliPath, env, host\.rootDir, instance\.runtimeAgentId\)/);
  assert.doesNotMatch(source, /gateway", "restart/);
});
