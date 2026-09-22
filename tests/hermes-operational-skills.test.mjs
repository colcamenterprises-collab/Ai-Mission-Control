import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("browser/computer execution is an approved governed skill", async () => {
  const skill = await read("skills/browser-computer-execution/SKILL.md");
  assert.match(skill, /status: approved/);
  assert.match(skill, /PLAN → ACT → OBSERVE → VERIFY → CORRECT → REPORT/);
  assert.match(skill, /Capture evidence of the resulting state/);
  assert.match(skill, /approval policy/);
});

test("video production is an approved skill rather than a standalone dashboard", async () => {
  const skill = await read("skills/video-creative-production/SKILL.md");
  assert.match(skill, /status: approved/);
  assert.match(skill, /text-to-video/);
  assert.match(skill, /image-to-video/);
  assert.match(skill, /reference-video/);
  assert.match(skill, /not a standalone product surface/);
});

test("Seth playbook routes video through governed creative production", async () => {
  const skill = await read("skills/restaurant-growth-operating-system/SKILL.md");
  assert.match(skill, /Video Creative Production skill/);
  assert.match(skill, /brief to generated\/captured asset, QA and export/);
});
