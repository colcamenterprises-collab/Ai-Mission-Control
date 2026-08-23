import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tasksPage = await readFile(new URL("../artifacts/mission-control/src/pages/tasks.tsx", import.meta.url), "utf8");
const operatingSurface = await readFile(new URL("../artifacts/mission-control/src/components/operating-surface-enhancements.tsx", import.meta.url), "utf8");
const reviewFixes = await readFile(new URL("../artifacts/mission-control/src/components/kanban-review-fixes.tsx", import.meta.url), "utf8");
const reviewCss = await readFile(new URL("../artifacts/mission-control/src/components/kanban-review-fixes.css", import.meta.url), "utf8");
const kanbanCompat = await readFile(new URL("../artifacts/api-server/src/routes/kanban-status-compat.ts", import.meta.url), "utf8");
const archiveScript = await readFile(new URL("../scripts/archive-signed-off-done-tasks.mjs", import.meta.url), "utf8");
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
  assert.match(kanbanCompat, /req\.body\?\.status !== "changes_required"/);
});

test("owner acceptance automatically archives completed work", () => {
  const acceptIndex = tasksPage.indexOf("/accept");
  const archiveAfterAcceptIndex = tasksPage.indexOf("/archive", acceptIndex);
  assert.ok(acceptIndex >= 0, "accept endpoint should be called");
  assert.ok(archiveAfterAcceptIndex > acceptIndex, "archive should follow owner acceptance");
  assert.match(tasksPage, /Accept & Archive/);
  const inlineAcceptIndex = operatingSurface.indexOf('action === "accept"');
  const inlineArchiveIndex = operatingSurface.indexOf("/archive", inlineAcceptIndex);
  assert.ok(inlineAcceptIndex >= 0, "inline accept action should exist");
  assert.ok(inlineArchiveIndex > inlineAcceptIndex, "inline acceptance must archive too");
});

test("inline change requests route to Changes Required", () => {
  const changeIndex = operatingSurface.indexOf('action === "changes"');
  const moveIndex = operatingSurface.indexOf("/move", changeIndex);
  assert.ok(changeIndex >= 0, "inline changes action should exist");
  assert.ok(moveIndex > changeIndex, "inline changes must use the Changes Required move");
  assert.match(operatingSurface, /status: "changes_required"/);
});

test("historical reconciliation requires final owner acceptance", () => {
  assert.match(archiveScript, /body\.startsWith\("OWNER ACCEPTED"\)/);
  assert.doesNotMatch(archiveScript, /APPROVED DIRECTLY FROM THE KANBAN CARD/);
  assert.doesNotMatch(archiveScript, /from "postgres"/);
});

test("archived tasks are not rendered on the active board", () => {
  assert.match(tasksPage, /filter\(\(task\) => !task\.archivedAt\)/);
});

test("Kanban is one board-level scroll surface", () => {
  assert.match(finalCss, /The Kanban is one board/);
  assert.match(finalCss, /\.mc-task-workspace[\s\S]*overflow: auto/);
  assert.match(finalCss, /\.mc-task-lane-scroll[\s\S]*overflow: visible/);
  assert.match(finalCss, /grid-auto-rows: max-content/);
  assert.match(finalCss, /align-items: stretch/);
  assert.match(reviewCss, /overflow-y: auto !important/);
  assert.match(reviewCss, /\.mc-task-lane-scroll[\s\S]*overflow: visible !important/);
  assert.match(reviewFixes, /preserveBoardVerticalWheel/);
  assert.match(reviewFixes, /event\.stopPropagation\(\)/);
});

test("dragging preserves card geometry without forced drag sizing", () => {
  assert.match(finalCss, /Dragging preserves source geometry/);
  assert.match(finalCss, /\.mc-task-card-dragging[\s\S]*border-radius: 0\.92rem/);
  assert.doesNotMatch(finalCss, /\.mc-task-card-dragging[\s\S]*min-width: 100% !important/);
  assert.doesNotMatch(finalCss, /\.mc-task-card-dragging[\s\S]*max-width: 100% !important/);
});

test("Kanban uses a visibly coloured matte card system and wins mounted overrides", () => {
  assert.match(finalCss, /#7edee7/);
  assert.match(finalCss, /#f2c46d/);
  assert.match(finalCss, /#ae95f4/);
  assert.match(finalCss, /#da7aaa/);
  assert.match(finalCss, /backdrop-filter: blur/);
  assert.match(reviewCss, /background: var\(--mc-card-bg\) !important/);
  assert.match(reviewCss, /border-radius: 0\.92rem !important/);
});

test("header hierarchy and controls are deliberate and consistent", () => {
  assert.match(finalCss, /\.mc-task-header h1[\s\S]*font-size: 1\.8rem/);
  assert.match(finalCss, /\.mc-task-primary-button,[\s\S]*width: 7\.4rem/);
  assert.match(finalCss, /height: 2\.65rem/);
});

test("zero message counts are hidden without suppressing real unread notifications", () => {
  assert.match(reviewFixes, /count <= 0/);
  assert.match(reviewFixes, /unread\.hidden/);
  assert.match(reviewCss, /span:first-child:not\(\[hidden\]\)/);
  assert.match(reviewCss, /display: flex !important/);
  assert.match(reviewCss, /span\[hidden\]/);
});
