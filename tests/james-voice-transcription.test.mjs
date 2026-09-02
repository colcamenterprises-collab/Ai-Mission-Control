import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../artifacts/mission-control/src/pages/james-voice.tsx", import.meta.url),
  "utf8",
);

test("voice transcription replaces interim hypotheses instead of appending them repeatedly", () => {
  assert.match(source, /dictationBase\.current = draft\.trim\(\)/);
  assert.match(source, /const sessionTranscript = `\$\{finalText\}\$\{interim\}`\.trim\(\)/);
  assert.match(source, /setDraft\(\[dictationBase\.current, sessionTranscript\]/);
  assert.doesNotMatch(source, /setDraft\(\(previous\) => finalText \? `\$\{previous\}/);
});
