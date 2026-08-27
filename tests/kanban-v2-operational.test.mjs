import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../artifacts/mission-control/src/pages/tasks-v2.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../artifacts/mission-control/src/pages/tasks-v2.css", import.meta.url), "utf8");
const app = await readFile(new URL("../artifacts/mission-control/src/App.tsx", import.meta.url), "utf8");

test("production tasks route uses Kanban V2", () => {
  assert.match(app, /import Tasks from "@\/pages\/tasks-v2"/);
  assert.match(app, /<Route path="\/tasks" component=\{TasksRoute\}/);
});

test("dragging uses a document-level DragOverlay instead of transforming source cards", () => {
  assert.match(page, /DragOverlay/);
  assert.match(page, /<DragOverlay dropAnimation=\{null\} zIndex=\{100000\}>/);
  assert.doesNotMatch(page, /translate3d\(/);
  assert.doesNotMatch(page, /transform\.x/);
  assert.match(css, /Source cards never translate through lane overflow or stacking contexts/);
  assert.match(css, /\.mc-kanban-v2-card-shell\.is-dragging[\s\S]*opacity: 0\.22/);
});

test("whole lanes are droppable and cross-lane moves are explicit", () => {
  assert.match(page, /useDroppable\(\{ id: column\.id \}\)/);
  assert.match(page, /data-kanban-lane=\{column\.id\}/);
  assert.match(page, /destination === "changes" \? "changes_required" : "running"/);
  assert.match(page, /Done is controlled by verification and owner sign-off/);
  assert.match(page, /Mission Control rejected that move\. The task was returned to its previous lane/);
});

test("task creation refreshes canonical server data and newest cards sort first", () => {
  assert.match(page, /fetch\("\/api\/orchestrator\/intake"/);
  assert.match(page, /await Promise\.all\(\[refreshTasks\(\), refreshProjects\(\)\]\)/);
  assert.match(page, /function newestFirst/);
  assert.match(page, /sort\(newestFirst\)/);
  assert.match(page, /cache: "no-store"/);
});

test("board remains four real Kanban lanes and tablet preserves card geometry", () => {
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1180px\)[\s\S]*repeat\(4, minmax\(17\.5rem, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*repeat\(4, minmax\(16\.5rem, 18rem\)\)/);
  assert.match(css, /scroll-snap-type: x proximity/);
});

test("task lifecycle controls stay inside the task detail workflow", () => {
  assert.match(page, /action\("approve"/);
  assert.match(page, /postAction\("request-changes"/);
  assert.match(page, /postAction\("accept"/);
  assert.match(page, /postAction\("archive"/);
  assert.match(page, /status: "changes_required"/);
  assert.match(page, /Accept & Archive/);
  assert.match(page, /Approval Required/);
  assert.match(page, /Owner Review Required/);
});