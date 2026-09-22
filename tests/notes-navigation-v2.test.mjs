import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Mission Control sidebar uses the simplified owner information architecture", async () => {
  const layout = await read("artifacts/mission-control/src/components/layout.tsx");
  assert.match(layout, /label: "Dashboard"/);
  assert.match(layout, /label: "Taskboard"/);
  assert.match(layout, /label: "Notes & Ideas"/);
  assert.match(layout, /mission-nav-parent-label[^]*Team/);
  assert.match(layout, /label: "Mission Brain"/);
  assert.match(layout, /label: "Skills & Instructions"/);
  assert.match(layout, /label: "Execution History"/);
  assert.doesNotMatch(layout, /href: "\/james", label: "Talk to James"/);
  assert.match(layout, /<GlobalQuickActions \/>/);
});

test("global quick actions expose equal-class note and James voice entry points", async () => {
  const [actions, css] = await Promise.all([
    read("artifacts/mission-control/src/components/global-quick-actions.tsx"),
    read("artifacts/mission-control/src/components/global-quick-actions.css"),
  ]);
  assert.match(actions, /aria-label="Quick note"/);
  assert.match(actions, /aria-label="Talk to James"/);
  assert.match(actions, /<JamesVoice compact autoStartVoice/);
  assert.match(actions, /<NoteComposer/);
  assert.match(css, /\.mission-quick-dock button\{width:3\.2rem;height:3\.2rem/);
});

test("Mission Brain no longer owns team execution and skill navigation", async () => {
  const [brain, hub, skills, executions] = await Promise.all([
    read("artifacts/mission-control/src/pages/mission-brain.tsx"),
    read("artifacts/mission-control/src/pages/business-hub.tsx"),
    read("artifacts/mission-control/src/pages/skills.tsx"),
    read("artifacts/mission-control/src/pages/executions.tsx"),
  ]);
  assert.doesNotMatch(brain, /href="\/skills"/);
  assert.doesNotMatch(brain, /href="\/brain\/executions"/);
  assert.doesNotMatch(brain, /href="\/team"/);
  assert.doesNotMatch(hub, /key: "skills", title: "Skills"/);
  assert.match(skills, /<h1>Skills & Instructions<\/h1>/);
  assert.match(executions, /Team · Control/);
});

test("note creation accepts optional project assignment without making it mandatory", async () => {
  const route = await read("artifacts/api-server/src/routes/inbox.ts");
  assert.match(route, /linkedProjectId = req\.body\?\.linkedProjectId/);
  assert.match(route, /linkedProjectId \}\)\.returning\(\)/);
  assert.match(route, /content and a valid source are required/);
});

test("Taskboard exposes priority controls and canonical Team execution history", async () => {
  const [tasks, intake, app, layout, executions] = await Promise.all([
    read("artifacts/mission-control/src/pages/tasks-v2.tsx"),
    read("artifacts/api-server/src/services/orchestrator-intake.ts"),
    read("artifacts/mission-control/src/App.tsx"),
    read("artifacts/mission-control/src/components/layout.tsx"),
    read("artifacts/mission-control/src/pages/executions.tsx"),
  ]);
  assert.match(tasks, /<h1>Taskboard<\/h1>/);
  assert.match(tasks, /Filter task priority/);
  assert.match(tasks, /mc-task-priority/);
  assert.match(tasks, /priority: form\.priority/);
  assert.match(intake, /"urgent"/);
  assert.match(app, /path="\/team\/executions"/);
  assert.match(layout, /href: "\/team\/executions", label: "Execution History"/);
  assert.match(executions, /const listHref = "\/team\/executions"/);
});

test("AI Team is grouped by real agent department and lead metadata", async () => {
  const team = await read("artifacts/mission-control/src/pages/team-unified.tsx");
  assert.match(team, /<h1>AI Team<\/h1>/);
  assert.match(team, /departmentGroups/);
  assert.match(team, /agent\.department/);
  assert.match(team, /agent\.isLead/);
  assert.match(team, /team-lead-badge/);
});

test("top-level page headings now match their navigation labels", async () => {
  const [dashboard, tasks, team, settings] = await Promise.all([
    read("artifacts/mission-control/src/pages/dashboard.tsx"),
    read("artifacts/mission-control/src/pages/tasks-v2.tsx"),
    read("artifacts/mission-control/src/pages/team-unified.tsx"),
    read("artifacts/mission-control/src/pages/settings.tsx"),
  ]);
  assert.match(dashboard, /<h1>Dashboard<\/h1>/);
  assert.match(tasks, /<h1>Taskboard<\/h1>/);
  assert.match(team, /<h1>AI Team<\/h1>/);
  assert.match(settings, /<h1 className="text-xl font-semibold tracking-tight">Settings<\/h1>/);
});

test("Notes Keep-style capture has real voice transcription and project search", async () => {
  const notes = await read("artifacts/mission-control/src/pages/notes.tsx");
  const composer = await read("artifacts/mission-control/src/components/note-composer.tsx");
  const inbox = await read("artifacts/api-server/src/routes/inbox.ts");
  assert.match(notes, /startVoice/);
  assert.match(composer, /voiceAction: "transcribe"/);
  assert.match(composer, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(composer, /Search projects/);
  assert.match(composer, /Clear completed/);
  assert.match(inbox, /already been promoted to Mission Brain/);
});
