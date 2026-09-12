import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync("artifacts/api-server/src/services/agent-runtime.ts", "utf8");

test("James internal runtime does not decrypt legacy external agent credential", () => {
  assert.match(runtime, /const apiKey = isJames \? null : decryptSecret\(agent\.apiKey\)/);
  assert.match(runtime, /if \(isJames\).*MISSION_CONTROL_ADMIN_TOKEN/s);
});
