import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Kanban task list bypasses the stale generated status enum", async () => {
  const [routes, compat] = await Promise.all([
    read("artifacts/api-server/src/routes/index.ts"),
    read("artifacts/api-server/src/routes/task-list-compat.ts"),
  ]);
  assert.ok(routes.indexOf("router.use(taskListCompatRouter)") < routes.indexOf("router.use(tasksRouter)"));
  assert.match(compat, /res\.json\(serializeDates\(/);
  assert.doesNotMatch(compat, /ListTasksResponse\.parse/);
  assert.match(compat, /archivedAt === null/);
});

test("calendar is a compact fourth Kanban surface and prominent Dashboard briefing widget", async () => {
  const [component, css] = await Promise.all([
    read("artifacts/mission-control/src/components/operating-surface-enhancements.tsx"),
    read("artifacts/mission-control/src/components/operating-surface-enhancements.css"),
  ]);
  assert.match(component, /createPortal\(<AutomationCalendar tasks=\{tasks\} context="tasks" \/>, taskWorkspaceNode\)/);
  assert.match(component, /document\.querySelector<HTMLElement>\("\.mission-briefing-panel"\)/);
  assert.match(css, /grid-template-columns:repeat\(4/);
  assert.match(css, /operating-calendar-tasks\{[^}]*width:18rem/);
  assert.match(css, /operating-calendar-dashboard\{[^}]*width:100%/);
});

test("task approval and review actions live on Kanban cards", async () => {
  const [layout, component, app] = await Promise.all([
    read("artifacts/mission-control/src/components/layout.tsx"),
    read("artifacts/mission-control/src/components/operating-surface-enhancements.tsx"),
    read("artifacts/mission-control/src/App.tsx"),
  ]);
  assert.doesNotMatch(layout, /href: "\/approvals"/);
  assert.match(layout, /Task approvals & review/);
  assert.match(component, /\/api\/tasks\/\$\{task\.id\}\/approve/);
  assert.match(component, /\/api\/tasks\/\$\{task\.id\}\/accept/);
  assert.match(app, /path="\/approvals" component=\{RedirectToTasks\}/);
});

test("Notes and Tasks remain explicitly separate", async () => {
  const [app, component, notesCss] = await Promise.all([
    read("artifacts/mission-control/src/App.tsx"),
    read("artifacts/mission-control/src/components/operating-surface-enhancements.tsx"),
    read("artifacts/mission-control/src/pages/notes.css"),
  ]);
  assert.match(app, /path="\/notes" component=\{Notes\}/);
  assert.match(component, /\/notes\?create=note/);
  assert.match(notesCss, /note-paper/);
  assert.match(notesCss, /--note-accent/);
});

test("durable memory sync runs on API startup with canonical categories", async () => {
  const [entry, sync] = await Promise.all([
    read("artifacts/api-server/src/index.ts"),
    read("artifacts/api-server/src/services/memory-sync.ts"),
  ]);
  assert.match(entry, /syncMemorySources\(\{ force: true \}\)/);
  assert.match(sync, /category: "knowledge"/);
  assert.match(sync, /category: "processes"/);
  assert.match(sync, /MISSION_CONTROL_OBSIDIAN_VAULT/);
  assert.doesNotMatch(sync, /category: "Documentation"/);
});
