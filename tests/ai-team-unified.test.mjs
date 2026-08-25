import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AI Team is the single employee and hiring destination", async () => {
  const [app, layout] = await Promise.all([
    read("artifacts/mission-control/src/App.tsx"),
    read("artifacts/mission-control/src/components/layout.tsx"),
  ]);
  assert.match(app, /Route path="\/team" component=\{TeamUnified\}/);
  assert.match(app, /Route path="\/team\/manage" component=\{Team\}/);
  assert.match(app, /RedirectToTeamHire/);
  assert.match(app, /team\?hire=1/);
  assert.doesNotMatch(layout, /href: "\/agent-creation", label: "Hire AI Employee"/);
  assert.match(layout, /\["Hire AI Employee", "\/team\?hire=1"\]/);
});

test("AI Team top row is exactly five glass employee slots", async () => {
  const [page, css] = await Promise.all([
    read("artifacts/mission-control/src/pages/team-unified.tsx"),
    read("artifacts/mission-control/src/pages/team-unified.css"),
  ]);
  assert.match(page, /agents\.slice\(0, 5\)/);
  assert.match(page, /Math\.max\(0, 5 - visibleAgents\.length\)/);
  assert.match(page, /Hire AI Employee/);
  assert.match(page, /AgentCreation/);
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /backdrop-filter: blur\(24px\)/);
  assert.match(css, /team-glass-card/);
});

test("employee cards prefer uploaded employee photos and keep text minimal", async () => {
  const page = await read("artifacts/mission-control/src/pages/team-unified.tsx");
  assert.match(page, /\/api\/employee-factory\/profiles/);
  assert.match(page, /profile\?\.avatarUrl/);
  assert.match(page, /team-agent-photo/);
  assert.match(page, /agent\.name/);
  assert.match(page, /agent\.role/);
  assert.match(page, /statusLabel\(agent\)/);
});
