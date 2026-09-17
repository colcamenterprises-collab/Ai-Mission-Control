import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skill = await readFile(
  new URL("../skills/restaurant-growth-operating-system/SKILL.md", import.meta.url),
  "utf8",
);

test("Seth remains the marketing authority with controlled execution", () => {
  assert.match(skill, /Seth Godin's canonical marketing operating playbook/);
  assert.match(skill, /James does not replace Seth's marketing judgement/);
  assert.match(skill, /Never activate advertising or increase budgets autonomously/);
  assert.match(skill, /Cameron approval is required for spend/);
});

test("restaurant growth playbook carries evidence and quality gates", () => {
  assert.match(skill, /restaurant outcomes and pains/);
  assert.match(skill, /FACT\/VERIFIED/);
  assert.match(skill, /Research gate/);
  assert.match(skill, /Creative gate/);
  assert.match(skill, /Execution gate/);
  assert.match(skill, /Learning gate/);
  assert.match(skill, /Product promises match approved V3 capability/);
});
