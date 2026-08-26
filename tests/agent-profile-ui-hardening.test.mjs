import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("agent profile modal stays contained on tablet layouts", async () => {
  const css = await read("artifacts/mission-control/src/pages/agent-profile-hardening.css");
  assert.match(css, /\.team-agent-modal\.agent-profile-panel|\.team-agent-modal \.agent-profile-panel/);
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /scrollbar-width:none/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /\.agent-question-grid\{grid-template-columns:1fr!important\}/);
  assert.match(css, /\.agent-profile-save\{position:sticky/);
});

test("manage modal supports add and change avatar for legacy and provisioned agents", async () => {
  const team = await read("artifacts/mission-control/src/pages/team-unified.tsx");
  const avatar = await read("artifacts/mission-control/src/pages/agent-avatar-editor.tsx");
  assert.match(team, /<AgentAvatarEditor/);
  assert.match(avatar, /\/api\/employee-factory\/avatar/);
  assert.match(avatar, /\/api\/employee-factory\/agents\/\$\{profile\.agentId\}\/profile/);
  assert.match(avatar, /profile \?\? \{ agentId: agent\.id/);
  assert.match(avatar, /Change avatar/);
  assert.match(avatar, /Add avatar/);
  assert.doesNotMatch(avatar, /password|apiKey/i);
});
