# James Conversational Voice — Ground Zero Patch 1.5

## Outcome

Mission Control exposes James as a first-class conversation surface at `/james`. Voice is an input/output modality for the existing James Hermes orchestrator, not a separate assistant or identity.

## Flow

1. Cameron taps **Talk to James** in Mission Control.
2. The browser microphone transcribes speech when Web Speech Recognition is supported. Typed input remains available everywhere.
3. The UI sends the current turn plus bounded recent conversation context to the authenticated `/api/james/message` route.
4. The existing `/usr/local/bin/james-hermes` bridge executes the turn with James's existing Mission Control context and guardrails.
5. The reply is rendered in the conversation and, by default, spoken with browser speech synthesis.
6. Recent conversation history is retained locally on the device and included in later turns so follow-up dialogue remains coherent.

## Identity and safety invariants

- Voice does not create a second James.
- The runtime remains the existing James Hermes bridge.
- Mission Control delegations, approvals and production locks remain authoritative.
- The UI explicitly instructs James not to claim execution unless execution actually occurred.
- Recent context is bounded to avoid unbounded prompt growth.
- Browser speech capability is optional; typed conversation always remains available.
- No new microphone audio storage is introduced by Mission Control. Browser speech recognition supplies text to the page.

## Mobile-first behaviour

The conversation is a full-height responsive surface with large microphone/send controls, a single composer, automatic scrolling, and spoken replies. It is intended to work first on phone/tablet and remain usable on desktop.

## Certification

Patch 1.5 code certification requires:

1. `/james` is routed and visible in primary navigation.
2. typed conversation reaches `/api/james/message`.
3. recent dialogue is included in subsequent turns.
4. microphone transcription is available when the browser exposes SpeechRecognition/webkitSpeechRecognition.
5. James replies can be spoken and muted.
6. production typecheck/build pass.
7. live certification after deployment confirms `/api/james/status` online and a real conversational turn succeeds.
