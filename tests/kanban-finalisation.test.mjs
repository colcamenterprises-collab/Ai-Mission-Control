import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tasksPage = await readFile(new URL("../artifacts/mission-control/src/pages/tasks.tsx", import.meta.url), "utf8");
const finalCss = await readFile(new URL("../artifacts/mission-control/src/pages/tasks-final.css", import.meta.url), "utf8");

test("Kanban exposes the owner workflow lanes", () => {
  assert.match(tasksPage, /Ideas &amp; To-Do/);
  assert.match(tasksPage, /label: "Doing"/);
  assert.match(tasksPage, /label: "Changes Required"/);
  assert.match(tasksPage, /label: "Done"/);
  assert.doesNotMatch(tasksPage, /label: "Review"/);
});

test("Changes Required is a first-class board destination", () => {
  assert.match(tasksPage, /matches: \["changes_required", "blocked"\]/);
  assert.match(tasksPage, /columnId === "changes" \? "changes_required" : "running"/);
  assert.match(tasksPage, /JSON\.stringify\(\{ status: "changes_required" \}\)/);
});

test("owner acceptance automatically archives completed work", () => {
  const acceptIndex = tasksPage.indexOf("/accept");
  const archiveAfterAcceptIndex = tasksPage.indexOf("/archive", acceptIndex);
  assert.ok(acceptIndex >= 0, "accept endpoint should be called");
  assert.ok(archiveAfterAcceptIndex > acceptIndex, "archive should follow owner acceptance");
  assert.match(tasksPage, /Accept & Archive/);
});

test("archived tasks are not rendered on the active board", () => {
  assert.match(tasksPage, /filter\(\(task\) => !task\.archivedAt\)/);
});

test("dragging preserves card geometry", () => {
  assert.match(finalCss, /No pill\/circle morphing/);
  assert.match(finalCss, /\.mc-task-card-dragging[\s\S]*border-radius: 1rem !important/);
  assert.match(finalCss, /min-width: 100% !important/);
  assert.match(finalCss, /max-width: 100% !important/);
});

test("Kanban uses a coloured card visual system", () => {
  assert.match(finalCss, /mc-task-card-tone-0/);
  assert.match(finalCss, /mc-task-card-tone-1/);
  assert.match(finalCss, /mc-task-card-tone-2/);
  assert.match(finalCss, /mc-task-card-tone-3/);
  assert.match(finalCss, /backdrop-filter: blur/);
});
