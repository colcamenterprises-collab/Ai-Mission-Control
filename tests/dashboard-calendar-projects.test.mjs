import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard calendar is mounted inside the James briefing area", async () => {
  const source = await read("artifacts/mission-control/src/components/operating-surface-enhancements.tsx");
  assert.match(source, /document\.querySelector<HTMLElement>\("\.mission-briefing-panel"\)/);
  assert.match(source, /AutomationCalendar tasks=\{tasks\} context="dashboard"/);
});

test("calendar dates open an interactive schedule modal", async () => {
  const [source, css] = await Promise.all([
    read("artifacts/mission-control/src/components/operating-surface-enhancements.tsx"),
    read("artifacts/mission-control/src/components/operating-surface-enhancements.css"),
  ]);
  assert.match(source, /setSelectedDate\(date\)/);
  assert.match(source, /operating-calendar-modal/);
  assert.match(source, /selectedDate\.toLocaleDateString/);
  assert.match(css, /\.operating-calendar-modal-backdrop/);
  assert.match(css, /\.operating-calendar-modal/);
});

test("dashboard exposes canonical Add Project action", async () => {
  const source = await read("artifacts/mission-control/src/components/operating-surface-enhancements.tsx");
  assert.match(source, /\+ Project/);
  assert.match(source, /fetch\("\/api\/projects"/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /Project created/);
});
