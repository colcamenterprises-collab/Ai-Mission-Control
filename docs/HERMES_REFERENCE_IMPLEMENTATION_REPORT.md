# Hermes Agent Mission Control Reference Report

The reference architecture was evaluated from the verified feature inventory supplied for `sharbelxyz/hermes-agent-mission-control`. Direct download remained unavailable in the build environment because outbound GitHub access returned HTTP 403, so no source code was copied and no licensing assumptions were made. The classifications below describe independent implementations against this repository's canonical architecture.

| Reference capability                   | Classification  | Mission Control treatment                                                                                                                                 |
| -------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request lifecycle and dispatch history | ADAPTED         | Generic durable work requests, guarded transitions, execution keys, and audit events.                                                                     |
| Hermes bridge and health               | CONSOLIDATED    | Existing authenticated generic bridge/runtime remains canonical; Hermes stays an adapter/provider value.                                                  |
| Approval inbox                         | ADAPTED         | One generic approval record bound uniquely to one work request.                                                                                           |
| Memory wiki                            | ADAPTED         | Existing Memory remains canonical; additive provenance metadata, access grants, and immutable database revisions provide equivalent safe version history. |
| Daily briefing                         | ALREADY PRESENT | Existing dashboard uses factual tasks, activity, approvals, and automations. No duplicate briefing subsystem added.                                       |
| Command palette                        | ADAPTED         | A global keyboard and visible-button palette links only to connected canonical Mission Control functions.                                                 |
| Cost insights                          | ADAPTED         | Execution schema records reported tokens and provider cost; missing values remain null/UNKNOWN.                                                           |
| Cron visibility                        | ALREADY PRESENT | Existing recurring tasks/calendar remains canonical.                                                                                                      |
| Client Pulse                           | ADAPTED         | Generic source and account-health persistence reports NOT_CONNECTED/NO_DATA until evidence is ingested.                                                   |
| Watchlist/radar/scanner/signals        | CONSOLIDATED    | One evidence-backed Signals model converts actionable records into canonical tasks without sample feeds.                                                  |
| Content workflows                      | ALREADY PRESENT | Existing content model remains canonical and unchanged.                                                                                                   |
| Tauri desktop                          | NOT APPLICABLE  | Target is the existing responsive web deployment.                                                                                                         |
| Security patterns                      | ADAPTED         | Owner authentication, worker-scoped tokens, one-request approvals, compare-and-set transitions, and recursive redaction.                                  |
