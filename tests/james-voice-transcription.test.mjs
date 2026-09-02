import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(
  new URL("../artifacts/mission-control/src/pages/james-voice.tsx", import.meta.url),
  "utf8",
);
const route = fs.readFileSync(
  new URL("../artifacts/api-server/src/routes/james-native-voice.ts", import.meta.url),
  "utf8",
);
const setup = fs.readFileSync(
  new URL("../scripts/setup-james-native-voice.sh", import.meta.url),
  "utf8",
);

test("James voice does not use browser speech recognition or browser TTS", () => {
  assert.doesNotMatch(page, /window\.SpeechRecognition/);
  assert.doesNotMatch(page, /webkitSpeechRecognition/);
  assert.doesNotMatch(page, /window\.speechSynthesis/);
  assert.doesNotMatch(page, /SpeechSynthesisUtterance/);
});

test("James voice uses Hermes native STT, persistent gateway session and interruption", () => {
  assert.match(page, /\/api\/audio\/transcribe/);
  assert.match(page, /\/api\/ws\?token=/);
  assert.match(page, /rpc\("session\.create"/);
  assert.match(page, /rpc\("session\.resume"/);
  assert.match(page, /rpc\("prompt\.submit"/);
  assert.match(page, /rpc\("session\.interrupt"/);
  assert.match(page, /frame\.type === "message\.delta"/);
  assert.match(page, /frame\.type === "message\.complete"/);
});

test("James voice uses Hermes TTS during streamed generation and stops on credit exhaustion", () => {
  assert.match(page, /\/api\/audio\/speak/);
  assert.match(page, /queueSpeechDelta\(delta\)/);
  assert.match(page, /HTTP 402\/credit errors stop the loop instead of retrying/);
  assert.match(page, /setState\("credit-limit"\)/);
  assert.match(page, /voiceModeRef\.current = false/);
});

test("native voice connection details are protected behind Mission Control admin routing", () => {
  assert.match(route, /HERMES_JAMES_SESSION_TOKEN/);
  assert.match(route, /browserSpeechRecognition: false/);
  assert.match(route, /browserSpeechSynthesis: false/);
  assert.match(route, /conversation: "tui-gateway-json-rpc"/);
});

test("host setup pins Hermes to loopback with free local STT and free TTS", () => {
  assert.match(setup, /serve --host 127\.0\.0\.1 --port/);
  assert.match(setup, /stt\["provider"\] = "local"/);
  assert.match(setup, /tts\["provider"\] = "edge"/);
  assert.match(setup, /faster-whisper/);
  assert.match(setup, /HERMES_DASHBOARD_SESSION_TOKEN/);
  assert.match(setup, /proxy_pass http:\/\/127\.0\.0\.1:/);
});
