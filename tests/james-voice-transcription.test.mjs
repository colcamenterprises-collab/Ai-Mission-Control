import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../artifacts/mission-control/src/pages/james-voice.tsx", import.meta.url), "utf8");
const bridge = fs.readFileSync(new URL("../artifacts/api-server/src/routes/james-native-voice-bridge.ts", import.meta.url), "utf8");
const setup = fs.readFileSync(new URL("../scripts/setup-james-native-voice.sh", import.meta.url), "utf8");

test("James voice does not use browser speech recognition or browser TTS", () => {
  assert.doesNotMatch(page, /window\.SpeechRecognition/);
  assert.doesNotMatch(page, /webkitSpeechRecognition/);
  assert.doesNotMatch(page, /window\.speechSynthesis/);
  assert.doesNotMatch(page, /SpeechSynthesisUtterance/);
});

test("James voice uses admin-authenticated Hermes STT and persistent gateway sessions", () => {
  assert.match(page, /voiceBridge<AudioTranscriptionResponse>\("transcribe"/);
  assert.match(page, /Authorization: `Bearer \$\{adminToken\(\)\}`/);
  assert.match(bridge, /\/api\/audio\/transcribe/);
  assert.match(page, /rpc\("session\.create"/);
  assert.match(page, /rpc\("session\.resume"/);
  assert.match(page, /rpc\("prompt\.submit"/);
  assert.match(page, /rpc\("session\.interrupt"/);
  assert.match(page, /frame\.type === "message\.delta"/);
  assert.match(page, /frame\.type === "message\.complete"/);
});

test("James speaks through the Hermes native PCM streaming websocket while generation continues", () => {
  assert.match(page, /\/api\/audio\/speak-stream\?ticket=/);
  assert.match(page, /activeSpeechStream\.current\?\.append\(delta\)/);
  assert.match(page, /send\(\{ done: true \}\)/);
  assert.match(page, /new Int16Array/);
  assert.match(page, /context\.createBuffer/);
  assert.match(page, /Tap the microphone while James is speaking to barge in/);
});

test("credit exhaustion stops automatic voice instead of retrying", () => {
  assert.match(page, /HTTP 402\/credit errors stop the loop instead of retrying/);
  assert.match(page, /creditBlocked\.current = true/);
  assert.match(page, /setState\("credit-limit"\)/);
  assert.match(page, /voiceModeRef\.current = false/);
  assert.match(page, /if \(!response\.ok\)/);
});

test("typed input discards an active microphone recording before submitting", () => {
  assert.match(page, /function discardActiveRecording\(\)/);
  assert.match(page, /discardRecording\.current = true/);
  assert.match(page, /recorder\.current\.stop\(\)/);
  assert.match(page, /async function submitPrompt[\s\S]*discardActiveRecording\(\);[\s\S]*await interruptJames\(\)/);
});

test("Hermes master credential never enters browser source or public nginx websocket config", () => {
  assert.doesNotMatch(page, /HERMES_DASHBOARD_SESSION_TOKEN/);
  assert.doesNotMatch(page, /HERMES_JAMES_SESSION_TOKEN/);
  assert.doesNotMatch(page, /X-Hermes-Session-Token/);
  assert.doesNotMatch(page, /\?token=/);
  assert.match(page, /voiceBridge<WsTicketResponse>\("ws-ticket"\)/);
  assert.match(page, /\?ticket=\$\{encodeURIComponent\(ticket\)\}/);
  assert.doesNotMatch(setup, /proxy_set_header X-Hermes-Session-Token/);
  assert.doesNotMatch(setup, /api\/ws\?token=\$TOKEN/);
  assert.match(bridge, /X-Hermes-Session-Token/);
  assert.match(bridge, /\/api\/auth\/ws-ticket/);
});

test("host setup pins Hermes to loopback, finds a real nginx server block, and fails closed without ticket support", () => {
  assert.match(setup, /serve --host 127\.0\.0\.1 --port/);
  assert.match(setup, /stt\["provider"\] = "local"/);
  assert.match(setup, /tts\["provider"\] = "edge"/);
  assert.match(setup, /faster-whisper/);
  assert.match(setup, /HERMES_DASHBOARD_SESSION_TOKEN/);
  assert.match(setup, /re\.finditer\(r"\(\?m\)\^\\s\*server\\s\*\\\{"/);
  assert.match(setup, /mission\.customli\.io was not inside the identified nginx server block/);
  assert.match(setup, /\/api\/auth\/ws-ticket/);
  assert.match(setup, /does not support authenticated WebSocket ticket minting/);
  assert.match(setup, /location = \$VOICE_PATH\/api\/audio\/speak-stream/);
  assert.match(setup, /proxy_pass http:\/\/127\.0\.0\.1:/);
});
