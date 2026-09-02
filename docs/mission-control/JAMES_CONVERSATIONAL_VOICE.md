# James Conversational Voice — Ground Zero Patch 1.5

## Outcome

`/james` is a voice client for the existing James Hermes orchestrator. Mission Control must not implement a second speech stack or a second James identity.

The first Patch 1.5 implementation used browser Web Speech Recognition plus browser speech synthesis. Production testing showed that approach was not an acceptable conversational interface: Chrome revised interim transcripts, device TTS merely read completed text aloud, the selected system voice was unrelated to James, and the interaction did not use Hermes's session/voice capabilities. That implementation is superseded.

Production testing of Hermes v0.18.0 also proved that `/api/audio/speak-stream` rejects every authenticated WebSocket handshake with HTTP 403 even though the same ticket/origin combinations succeed on `/api/ws`. Edge TTS is also a non-streaming Hermes provider. Patch 1.5 therefore uses Hermes's authenticated `/api/audio/speak` endpoint incrementally per completed response phrase until the installed Hermes version can support the streaming endpoint reliably.

## Canonical architecture

```text
Tablet browser microphone
        |
        | MediaRecorder audio only
        v
Mission Control /james
        |
        +--> admin-authenticated POST /api/james/message
        |       status / local STT / WS-ticket mint / Hermes TTS speak
        |       Hermes credentials remain server-side
        |
        +--> /hermes-james/api/ws?ticket=<single-use ticket>
        |       persistent TUI-gateway JSON-RPC session
        |       session.create / session.resume
        |       prompt.submit
        |       message.delta / message.complete
        |       session.interrupt
        |
        +--> authenticated Mission Control bridge -> Hermes /api/audio/speak
                completed response phrase -> Edge TTS -> data:audio -> tablet speaker

James Hermes headless backend: 127.0.0.2:9120 only
```

The browser captures audio because a remote server cannot access an Android tablet microphone directly. It does **not** perform speech recognition and it does **not** synthesize James's voice.

## Conversation behaviour

1. Cameron starts voice conversation once.
2. Mission Control records the current utterance and uses local amplitude/silence detection only to decide when the human turn ended.
3. The recording is posted to the existing admin-authenticated `POST /api/james/message` route with `voiceAction: "transcribe"`. A dedicated compatibility router forwards it server-to-server to Hermes `/api/audio/transcribe`.
4. Hermes transcribes through the configured STT provider. Ground Zero default is `local` / `faster-whisper`, so transcription does not consume OpenRouter or a paid speech API.
5. Mission Control requests a Hermes single-use WebSocket ticket through the same authenticated James route and opens one persistent Hermes JSON-RPC session.
6. The transcript is submitted using `prompt.submit`. Mission Control does not rebuild the previous written chat into every prompt; Hermes owns the session context.
7. While `message.delta` events arrive, Mission Control buffers only enough text to form a completed sentence/phrase. Each completed phrase is sent through the authenticated server-side bridge using `voiceAction: "speak"`, which calls Hermes `/api/audio/speak`. The returned Hermes audio data URL is played automatically on the tablet.
8. Phrase audio is queued in generation order. This preserves conversational incremental speech even though Hermes v0.18.0 cannot currently use the newer streaming-TTS WebSocket reliably with Edge TTS.
9. `message.complete` flushes the final partial phrase. When queued audio drains, the microphone automatically re-arms for the next human turn.
10. If Cameron taps the microphone while James is speaking, Mission Control immediately stops current queued audio, calls `session.interrupt`, and begins the new human utterance. This is the barge-in path.
11. Typed input remains available and enters the same persistent Hermes session.

## Cost policy

Voice transport must not require paid speech APIs for normal Ground Zero operation.

- STT default: `local` using `faster-whisper`.
- TTS default: `edge`, a free Hermes TTS provider, delivered through authenticated `/api/audio/speak` requests.
- James's reasoning model remains controlled separately by Mission Control model policy / Hermes runtime configuration.
- An HTTP/provider 402, insufficient-credit, insufficient-balance or equivalent failure disables the automatic voice loop immediately. Mission Control surfaces the failure and does not retry the turn automatically.

## Identity and security invariants

- Voice does not create another James.
- The dedicated backend is started through `/usr/local/bin/james-hermes serve`, preserving the James runtime rather than launching a generic browser chatbot.
- The Hermes backend binds only to `127.0.0.2`.
- Hermes basic-auth credentials are generated on the host in a root-only environment file. They are available to the loopback Hermes service and Mission Control API service only.
- REST status, transcription and TTS are **not** publicly proxied to Hermes. They are reached only through Mission Control's admin-authenticated `POST /api/james/message` route.
- The only public nginx Hermes exposure is the exact WebSocket path `/hermes-james/api/ws` used for the persistent conversation gateway.
- Before the browser conversation WebSocket opens, Mission Control admin auth is required to mint a Hermes single-use ticket from `/api/auth/ws-ticket`. The browser receives only that short-lived single-use ticket, never Hermes credentials.
- Nginx does not inject Hermes credentials into public requests.
- Mission Control delegations, owner approvals and production locks remain authoritative inside the James runtime.
- Browser `SpeechRecognition`, `webkitSpeechRecognition`, `speechSynthesis`, and `SpeechSynthesisUtterance` are prohibited on the James voice surface.
- Microphone audio is transient; Mission Control does not add a durable audio archive.

## Host requirements

`scripts/setup-james-native-voice.sh` performs the host bootstrap after the application code is deployed. It deliberately fails closed if the installed `james-hermes` does not expose the required `serve` backend, if James's Hermes config cannot be located, or if the installed Hermes build cannot mint authenticated single-use WebSocket tickets.

The setup:

1. verifies `james-hermes serve` exists;
2. uses James's existing Python virtual environment;
3. ensures `faster-whisper` and `edge-tts` are installed without replacing the James runtime;
4. backs up Hermes `config.yaml`;
5. configures `stt.provider: local`, a local Whisper model, and `tts.provider: edge`;
6. creates `james-hermes-voice.service` bound to `127.0.0.2:9120`;
7. generates Hermes gated basic-auth credentials in `/etc/ai-mission-control/james-voice.env` with mode `0600`;
8. attaches that root-only environment file to the Mission Control API service so its authenticated voice bridge can make loopback Hermes calls;
9. verifies local `/api/status` is gated;
10. verifies authenticated `POST /api/auth/ws-ticket` returns a valid ticket;
11. exposes only `/hermes-james/api/ws` through nginx;
12. validates nginx, restarts Mission Control, and verifies Mission Control health.

## Certification

Patch 1.5 is not operationally certified merely because the React page builds. Certification requires all of the following on production:

1. Mission Control is deployed on the merged Patch 1.5 replacement SHA.
2. `james-hermes-voice.service` is active and bound only to loopback.
3. Hermes `/api/status` passes locally and gated auth is enabled.
4. `POST /api/auth/ws-ticket` passes locally and the browser can connect to the ticket-protected `/api/ws` conversation gateway.
5. Hermes credentials are absent from browser source, browser storage, and browser-generated request headers/query strings.
6. a tablet recording is successfully transcribed by Hermes local STT through the admin-authenticated Mission Control bridge.
7. a persistent Hermes session is created/resumed and a multi-turn follow-up retains context without Mission Control rebuilding prior turns into each prompt.
8. James begins audible Hermes TTS playback from completed response phrases before the final written response completes.
9. barge-in stops current speech and interrupts the active Hermes turn.
10. the microphone re-arms after reply audio drains without another Send action.
11. a simulated or real 402 path stops the automatic voice loop without retrying.
12. typed input reaches the same live James session.
13. Mission Control typecheck/build and CI are green.

Until all live checks pass, Patch 1.5 remains implemented-but-not-operationally-certified.
