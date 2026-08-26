import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("team page renders exactly one hire card and agent-level manage/chat actions", async () => {
  const source = await read("artifacts/mission-control/src/pages/team-unified.tsx");
  const hireCardMatches = source.match(/<strong>Hire AI Employee<\/strong>/g) ?? [];
  assert.equal(hireCardMatches.length, 1);
  assert.match(source, /openAgent\(agent\.id, "manage"\)/);
  assert.match(source, /openAgent\(agent\.id, "chat"\)/);
  assert.doesNotMatch(source, /emptySlots|Array\.from\(\{ length: emptySlots \}\)/);
});

test("team page keeps management and chat in the same modal", async () => {
  const source = await read("artifacts/mission-control/src/pages/team-unified.tsx");
  assert.match(source, /function AgentModal/);
  assert.match(source, /What this employee is responsible for/);
  assert.match(source, /Assigned skills/);
  assert.match(source, /Direct chat with \{agent\.name\}/);
  assert.match(source, /\/api\/agents\/\$\{agent\.id\}\/test-task/);
});

test("legacy manage page redirects to unified team and team scrollbars are invisible", async () => {
  const app = await read("artifacts/mission-control/src/App.tsx");
  const css = await read("artifacts/mission-control/src/pages/team-unified.css");
  assert.match(app, /<Route path="\/team\/manage" component=\{RedirectToTeam\}/);
  assert.match(css, /scrollbar-width: none/);
  assert.match(css, /::-webkit-scrollbar/);
  assert.match(css, /width: 0/);
});
