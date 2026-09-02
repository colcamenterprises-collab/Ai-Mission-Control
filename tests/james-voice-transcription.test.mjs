import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../artifacts/mission-control/src/pages/james-voice.tsx", import.meta.url),
  "utf8",
);

test("voice transcription replaces browser interim hypotheses instead of accumulating them", () => {
  assert.match(source, /for \(let i = 0; i < event\.results\.length; i \+= 1\)/);
  assert.match(source, /const sessionTranscript = \[finalText, interim\]\.filter\(Boolean\)\.join\(" "\)\.trim\(\)/);
  assert.match(source, /voiceSessionTranscript\.current = sessionTranscript/);
  assert.match(source, /setDraft\(\[voiceBaseDraft\.current, sessionTranscript\]/);
  assert.doesNotMatch(source, /voiceFinalTranscript\.current = `\$\{voiceFinalTranscript\.current\}/);
});

test("voice mode is a complete conversational turn with automatic send and spoken reply", () => {
  assert.match(source, /r\.continuous = false/);
  assert.match(source, /if \(shouldSend && message\) window\.setTimeout\(\(\) => \{ void send\(message\); \}, 0\)/);
  assert.match(source, /if \(autoSpeak\) speak\(content\)/);
  assert.match(source, /synth\.resume\(\)/);
  assert.match(source, /aria-label="Play James reply"/);
});
