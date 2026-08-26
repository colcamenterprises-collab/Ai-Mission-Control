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
  assert.match(avatar, /AVATAR_MAX_EDGE = 512/);
  assert.match(avatar, /image\/webp/);
  assert.match(avatar, /Change avatar/);
  assert.match(avatar, /Add avatar/);
  assert.doesNotMatch(avatar, /password|apiKey/i);
});

test("employee avatars are publicly readable through nginx API proxy while writes stay protected", async () => {
  const app = await read("artifacts/api-server/src/app.ts");
  const route = await read("artifacts/api-server/src/routes/employee-factory.ts");
  const routesIndex = await read("artifacts/api-server/src/routes/index.ts");
  assert.match(app, /app\.use\("\/api\/employee-avatars", avatarStatic\)/);
  assert.match(app, /express\.static\(path\.join\(dataDir, "avatars"\)/);
  assert.match(route, /AVATAR_PUBLIC_PREFIX = "\/api\/employee-avatars\/"/);
  assert.match(route, /PREVIOUS_AVATAR_PREFIX = "\/api\/employee-factory\/avatar\/"/);
  assert.match(route, /LEGACY_AVATAR_PREFIX = "\/employee-avatars\/"/);
  assert.match(route, /publicAvatarUrl\(storedAvatar\)/);
  assert.match(route, /const avatarUrl = `\$\{AVATAR_PUBLIC_PREFIX\}\$\{filename\}`/);
  assert.match(routesIndex, /router\.use\(requireAdminAuth\)/);
  assert.match(route, /router\.post\(\s*"\/employee-factory\/avatar"/s);
});

test("team loads protected employee profiles with the admin token so saved avatars can render", async () => {
  const team = await read("artifacts/mission-control/src/pages/team-unified.tsx");
  assert.match(team, /mission_control_admin_token/);
  assert.match(team, /fetch\("\/api\/employee-factory\/profiles"/);
  assert.match(team, /Authorization: `Bearer \$\{token\}`/);
  assert.match(team, /"x-admin-token": token/);
  assert.match(team, /profile\?\.avatarUrl \? <img src=\{profile\.avatarUrl\}/);
});
