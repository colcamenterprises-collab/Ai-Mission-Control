# Mission Control Kanban Finalisation — 2026-08-23

## Active board

The owner-facing board is intentionally limited to four operational surfaces:

1. **Ideas & To-Do** — lightweight capture; no worker allocation or execution until **Make Task**.
2. **Doing** — active orchestration and execution.
3. **Changes Required** — rework, failed verification, and explicit blockers requiring resolution.
4. **Done** — James/orchestrator has verified the success milestone; owner sign-off may still be required.

Archive is not a permanent Kanban lane. Archived work leaves the active board but preserves its full record.

## Owner sign-off

When owner review is required, the final flow is:

`James verifies → Done → Cameron Accepts → Archive`

The UI performs acceptance and archive as one owner action. Requesting changes preserves the same task and routes it to **Changes Required**.

Historical tasks already in `done` remain manually archivable so old data can be cleaned safely without deleting history.

## Dragging

Dragging is a presentation state only. A dragged card must preserve width, height, padding, content layout, and corner radius. The final visual layer explicitly fixes card geometry during drag so cards cannot collapse into pill/circle shapes.

## Visual direction

The board uses a dark glass workspace with restrained matte colour variation across cards. Colour improves scanability but is not the sole status indicator. Cards remain compact, readable, and operational rather than decorative.

## Compatibility

Legacy task statuses remain supported by lane mapping:

- `backlog`, `ready`, `running`, `in_progress`, `completion_pending` → Doing
- `changes_required`, `blocked` → Changes Required
- `review`, `done` → Done

This avoids destructive status migrations while presenting the simplified owner-facing workflow.
