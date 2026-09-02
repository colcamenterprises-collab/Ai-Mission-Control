# James Conversational Voice — Ground Zero Patch 1.5

## Outcome

`/james` is a voice client for the existing James Hermes orchestrator. Mission Control must not implement a second speech stack or a second James identity.

The first Patch 1.5 implementation used browser Web Speech Recognition plus browser speech synthesis. Production testing showed that approach was not an acceptable conversational interface: Chrome revised interim transcripts, device TTS merely read completed text aloud, the selected system voice was unrelated to James, and the interaction did not use Hermes's session/voice capabilities. That implementation is superseded.

## Canonical architecture

```text
Tablet browser microphone
        |
        | MediaRecorder audio only
        v
Mission Control /james
        |
        | authenticated same-origin bridge
        v
James Hermes headless backend (loopback only)
        |
        +--> /api/audio/transcribe --> Hermes STT (local faster-whisper)
        |
        +--> /api/ws --> persistent TUI-gateway JSON-RPC session
        |       session.create / session.resume
        |       prompt.submit
        |       message.delta / message.complete
        |       session.interrupt
        |
        +--> /api/audio/speak --> Hermes TTS (free Edge default)
```

The browser captures audio because a remote server cannot access an Android tablet microphone directly. It does **not** perform speech recognition and it does **not** synthesize James's voice.

## Conversation behaviour

1. Cameron starts voice conversation once.
2. Mission Control records the current utterance and uses local amplitude/silence detection only to decide when the human turn ended.
3. Recorded audio is sent to Hermes `/api/audio/transcribe`.
4. Hermes transcribes through the configured STT provider. Ground Zero default is `local` / `faster-whisper`, so transcription does not consume OpenRouter or speech API credits.
5. The transcript is submitted into one persistent Hermes JSON-RPC session using `prompt.submit`.
6. James's `message.delta` events are rendered as they arrive. Completed sentences are sent to Hermes TTS immediately, so speech overlaps response generation instead of waiting for a completed written answer and then reading it back.
7. When generation and queued speech finish, the microphone automatically re-arms for the next human turn.
8. If Cameron speaks while James is responding, Mission Control stops current audio, clears queued speech, calls `session.interrupt`, and starts the new utterance. This is the barge-in path.
9. Typed input remains available and enters the same Hermes session.

## Cost policy

Voice transport must not require paid speech APIs for normal Ground Zero operation.

- STT default: `local` using `faster-whisper`.
- TTS default: `edge`, a free Hermes TTS provider.
- James's reasoning model remains controlled separately by Mission Control model policy / Hermes runtime configuration.
- An HTTP/provider 402, insufficient-credit, insufficient-balance or equivalent failure immediately disables the automatic voice loop. Mission Control must surface the failure and must not retry repeatedly.

## Identity and safety invariants

- Voice does not create another James.
- The dedicated backend is started through `/usr/local/bin/james-hermes serve`, preserving the James runtime rather than launching a generic browser chatbot.
- The Hermes backend binds only to `127.0.0.1` and is exposed to the owner through the existing `mission.customli.io` nginx boundary.
- Hermes's dashboard session token is generated on the host, stored in a root-readable environment file, and released to the browser only through Mission Control's authenticated admin route.
- Mission Control delegations, owner approvals and production locks remain authoritative.
- Browser `SpeechRecognition`, `webkitSpeechRecognition`, `speechSynthesis`, and `SpeechSynthesisUtterance` are prohibited on the James voice surface.
- Microphone audio is transient; Mission Control does not add a durable audio archive.

## Host requirements

`scripts/setup-james-native-voice.sh` performs the host bootstrap after the application code is deployed. It deliberately fails closed if the installed `james-hermes` does not expose the required `serve` backend or if it cannot identify James's Hermes config.

The setup:

1. verifies `james-hermes serve` exists;
2. uses James's existing Python virtual environment;
3. ensures `faster-whisper` and `edge-tts` are installed without replacing the James runtime;
4. backs up Hermes `config.yaml`;
5. configures `stt.provider: local`, a local Whisper model, and `tts.provider: edge`;
6. creates a dedicated loopback `james-hermes-voice.service` on port `9120`;
7. generates a new Hermes dashboard session token;
8. attaches the same protected token to Mission Control through a systemd environment file;
9. exposes `/hermes-james/` through the existing nginx `mission.customli.io` server block with WebSocket upgrades;
10. verifies the Hermes `/api/status` endpoint before restarting Mission Control.

## Certification

Patch 1.5 is not operationally certified merely because the React page builds. Certification requires all of the following on production:

1. Mission Control is deployed on the merged Patch 1.5 replacement SHA.
2. `james-hermes-voice.service` is active and bound only to loopback.
3. authenticated Hermes `/api/status` passes.
4. `/api/james/native-voice/config` reports `mode: hermes-native` and browser speech features false.
5. a tablet recording is successfully transcribed by Hermes local STT.
6. a persistent Hermes session is created/resumed and a multi-turn follow-up retains context without Mission Control rebuilding prior messages into each prompt.
7. James begins speaking from streamed response sentences rather than waiting to read a completed answer.
8. barge-in stops speech and interrupts the active Hermes turn.
9. the microphone re-arms for the next turn without another Send action.
10. a simulated/real 402 path stops the automatic loop without retrying.
11. typed input reaches the same live James session.
12. Mission Control typecheck/build and CI are green.

Until those live checks pass, Patch 1.5 remains deployed-but-not-certified.
