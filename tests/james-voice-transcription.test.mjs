import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../artifacts/mission-control/src/pages/james-voice.tsx", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../artifacts/api-server/src/app.ts", import.meta.url), "utf8");
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
  assert.match(page, /pushed\.type === "message\.delta"/);
  assert.match(page, /pushed\.type === "message\.complete"/);
});

test("Hermes JSON-RPC event envelopes are unwrapped before James renders streaming events", () => {
  assert.match(page, /frame\.method === "event" && frame\.params \? frame\.params : frame/);
  assert.match(page, /type GatewayEvent/);
  assert.match(page, /method\?: string; params\?: GatewayEvent/);
});

test("live voice uploads get a bounded route-specific JSON body allowance", () => {
  assert.match(app, /app\.use\("\/api\/james\/message", express\.json\(\{ limit: "8mb" \}\)\)/);
  assert.match(app, /app\.use\(express\.json\(\)\)/);
});

test("James starts a fresh post-fix Hermes session", () => {
  assert.match(page, /mission_control_james_hermes_session_v2/);
  assert.doesNotMatch(page, /mission_control_james_hermes_session_v1/);
});

test("James speaks incrementally through the authenticated Hermes REST TTS bridge", () => {
  assert.match(page, /voiceBridge<AudioSpeakResponse>\("speak", \{ text: clean \}\)/);
  assert.match(bridge, /VOICE_ACTIONS = new Set\(\["status", "transcribe", "ws-ticket", "speak"\]\)/);
  assert.match(bridge, /\/api\/audio\/speak/);
  assert.match(page, /flushSentences/);
  assert.match(page, /activeSpeechQueue\.current\?\.append\(delta\)/);
  assert.match(page, /new Audio\(dataUrl\)/);
  assert.match(page, /Tap the microphone while James is speaking to barge in/);
  assert.doesNotMatch(page, /\/api\/audio\/speak-stream\?ticket=/);
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

test("Hermes credentials never enter browser source or public nginx websocket config", () => {
  assert.doesNotMatch(page, /HERMES_DASHBOARD_SESSION_TOKEN/);
  assert.doesNotMatch(page, /HERMES_JAMES_SESSION_TOKEN/);
  assert.doesNotMatch(page, /HERMES_DASHBOARD_BASIC_AUTH_PASSWORD/);
  assert.doesNotMatch(page, /X-Hermes-Session-Token/);
  assert.doesNotMatch(page, /\?token=/);
  assert.match(page, /voiceBridge<WsTicketResponse>\("ws-ticket"/);
  assert.match(page, /\?ticket=\$\{encodeURIComponent\(ticket\)\}/);
  assert.doesNotMatch(setup, /proxy_set_header X-Hermes-Session-Token/);
  assert.doesNotMatch(setup, /api\/ws\?token=/);
  assert.doesNotMatch(setup, /location = \$VOICE_PATH\/api\/audio\/speak-stream/);
  assert.match(bridge, /\/auth\/password-login/);
  assert.match(bridge, /Cookie: cookie/);
  assert.match(bridge, /\/api\/auth\/ws-ticket/);
});

test("host setup uses gated Hermes auth on a private loopback address and fails closed without it", () => {
  assert.match(setup, /VOICE_HOST="\$\{HERMES_JAMES_VOICE_HOST:-127\.0\.0\.2\}"/);
  assert.match(setup, /serve --host \$VOICE_HOST --port/);
  assert.match(setup, /HERMES_DASHBOARD_BASIC_AUTH_USERNAME/);
  assert.match(setup, /HERMES_DASHBOARD_BASIC_AUTH_PASSWORD/);
  assert.match(setup, /HERMES_DASHBOARD_BASIC_AUTH_SECRET/);
  assert.match(setup, /payload\.get\("auth_required"\) is True/);
  assert.match(setup, /"basic" in providers/);
  assert.match(setup, /\/auth\/password-login/);
  assert.match(setup, /\/api\/auth\/ws-ticket/);
  assert.match(setup, /stt\["provider"\] = "local"/);
  assert.match(setup, /tts\["provider"\] = "edge"/);
  assert.match(setup, /faster-whisper/);
  assert.match(setup, /re\.finditer\(r"\(\?m\)\^\\s\*server\\s\*\\\{"/);
  assert.match(setup, /mission\.customli\.io was not inside the identified nginx server block/);
  assert.match(setup, /location = \$VOICE_PATH\/api\/ws/);
  assert.match(setup, /proxy_pass http:\/\/\$VOICE_HOST:/);
});

test("James voice setup pins new sessions to OpenRouter auto routing", () => {
  assert.match(setup, /JAMES_MODEL="\$\{HERMES_JAMES_MODEL:-openrouter\/auto\}"/);
  assert.match(setup, /model\["provider"\] = "openrouter"/);
  assert.match(setup, /model\["default"\] = os\.environ\["HERMES_JAMES_MODEL"\]/);
  assert.match(setup, /model\["base_url"\] = ""/);
  assert.match(setup, /model\["api_mode"\] = "chat_completions"/);
});

test("dedicated Hermes conversation runtime is James, not generic Hermes", () => {
  assert.match(setup, /# James — Mission Control Orchestrator/);
  assert.match(setup, /You are James, the Mission Control Orchestrator/);
  assert.match(setup, /Hermes Agent is your runtime, not your identity/);
  assert.match(setup, /agent\["system_prompt"\]/);
  assert.match(setup, /Mission Control owns tasks, delegations, approvals/);
});

test("Mission Control owns spoken output on the James web surface", () => {
  assert.match(setup, /never call standalone text-to-speech or emit MEDIA paths/);
  assert.match(setup, /Never invoke the standalone text_to_speech\/voice tool/);
  assert.match(setup, /voice\["auto_tts"\] = True/);
  assert.match(setup, /authenticated Hermes TTS/);
});
