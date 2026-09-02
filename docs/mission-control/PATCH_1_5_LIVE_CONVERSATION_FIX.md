# Patch 1.5 live conversation fix

Live Redmi tablet acceptance on 2026-09-02 exposed three defects after the native Hermes backend had passed server bootstrap:

1. Hermes gateway events arrive as JSON-RPC `method: "event"` envelopes whose payload is under `params`; the Mission Control James page was reading only top-level event fields and therefore ignored `message.delta`, `message.complete`, and runtime errors.
2. Voice recordings are base64 data URLs and exceeded Express's default JSON body limit on `POST /api/james/message`. A route-specific 8 MB parser now applies only to that authenticated bridge endpoint.
3. The live Hermes worker inherited `openai/gpt-5.4-mini`. The James voice bootstrap now pins the Hermes main model to provider `openrouter`, default `openrouter/auto`, and rotates the browser session-storage key so the next browser session is newly created under the corrected model configuration.

The native voice security model remains unchanged: Hermes stays on private `127.0.0.2`, gated basic-auth credentials remain server-side, and browser WebSockets use short-lived single-use tickets only.

Operational certification still requires a fresh live tablet conversation after deployment.