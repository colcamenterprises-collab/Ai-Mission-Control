import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const auth = fs.readFileSync(
  "artifacts/api-server/src/services/admin-session.ts",
  "utf8",
);
const authRoute = fs.readFileSync(
  "artifacts/api-server/src/routes/auth-session.ts",
  "utf8",
);
const authMiddleware = fs.readFileSync(
  "artifacts/api-server/src/lib/auth.ts",
  "utf8",
);
const agents = fs.readFileSync(
  "artifacts/api-server/src/routes/agents.ts",
  "utf8",
);
const graph = fs.readFileSync(
  "artifacts/api-server/src/routes/brain-graph.ts",
  "utf8",
);
const app = fs.readFileSync("artifacts/mission-control/src/App.tsx", "utf8");
const dashboard = fs.readFileSync(
  "artifacts/mission-control/src/pages/dashboard.tsx",
  "utf8",
);
const brain = fs.readFileSync(
  "artifacts/mission-control/src/pages/mission-brain.tsx",
  "utf8",
);

test("owner UI uses signed HttpOnly session rather than browser admin token", () => {
  assert.match(authRoute, /httpOnly:\s*true/);
  assert.match(authRoute, /sameSite:\s*"strict"/);
  assert.match(authRoute, /secure:\s*secureCookie\(\)/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /payload\.exp <= Math\.floor\(now \/ 1000\)/);
  assert.match(app, /<AuthGate>/);
});

test("service bearer authentication remains supported beside owner session", () => {
  assert.match(authMiddleware, /ownerSessionFromRequest\(req\)/);
  assert.match(authMiddleware, /req\.headers\.authorization/);
  assert.match(authMiddleware, /x-admin-token/);
});

test("bad agent credential cannot collapse the whole agent directory", () => {
  assert.match(agents, /credentialHealth: "unreadable"/);
  assert.match(agents, /try \{[\s\S]*decryptSecret\(apiKey\)/);
  assert.match(agents, /catch \{/);
});

test("dashboard distinguishes degraded data from healthy zeroes", () => {
  assert.match(dashboard, /controlPlaneError/);
  assert.match(dashboard, /Control-plane data degraded/);
  assert.match(dashboard, /<ModelObservability \/>/);
  assert.match(dashboard, /value=\{isSummaryError \|\| isTasksError \? "—"/);
});

test("Mission Brain graph is built from stored entities and relationships", () => {
  assert.match(graph, /projectsTable/);
  assert.match(graph, /agentsTable/);
  assert.match(graph, /tasksTable/);
  assert.match(graph, /memoriesTable/);
  assert.match(graph, /memoryAgentGrantsTable/);
  assert.match(brain, /<MissionBrainGraph \/>/);
});
