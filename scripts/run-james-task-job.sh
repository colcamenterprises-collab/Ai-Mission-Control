#!/usr/bin/env bash
set -Eeuo pipefail

JOB_ID="${1:?job id required}"
TASK_ID="${2:?task id required}"
COMMAND_ID="${3:-}"
PROMPT_FILE="${4:?prompt file required}"
REPO="${MISSION_CONTROL_REPO_DIR:-/opt/apps/ai-mission-control}"
JAMES_BINARY="${JAMES_BINARY:-/usr/local/bin/james-hermes}"
STATE_DIR="/var/lib/ai-mission-control/james-jobs"
WORKTREE_ROOT="/var/lib/ai-mission-control/worktrees"
WORKTREE="$WORKTREE_ROOT/task-$TASK_ID"
OUTPUT_FILE="$STATE_DIR/$JOB_ID.out"
ERROR_FILE="$STATE_DIR/$JOB_ID.err"
STATUS_FILE="$STATE_DIR/$JOB_ID.status"

mkdir -p "$STATE_DIR" "$WORKTREE_ROOT"
printf 'running\n' > "$STATUS_FILE"

# James must never develop in the production checkout. Each task gets a persistent,
# isolated worktree that can survive follow-up executions without dirtying production.
if [[ ! -d "$WORKTREE/.git" && ! -f "$WORKTREE/.git" ]]; then
  git -C "$REPO" fetch origin main >/dev/null 2>&1 || true
  git -C "$REPO" worktree add --detach "$WORKTREE" origin/main >/dev/null
fi

PROMPT="$(cat "$PROMPT_FILE")"
PROMPT="Execution workspace: $WORKTREE
Production checkout: $REPO
Do not modify the production checkout. Perform repository work only inside the execution workspace.

At the END of your response, emit exactly one machine-readable result line:
MISSION_CONTROL_RESULT: COMPLETED
MISSION_CONTROL_RESULT: IN_PROGRESS
MISSION_CONTROL_RESULT: CHANGES_REQUIRED
MISSION_CONTROL_RESULT: BLOCKED
MISSION_CONTROL_RESULT: FAILED
MISSION_CONTROL_RESULT: NEEDS_CLARIFICATION

Use COMPLETED only when the original Owner Brief/success milestone has been fully verified. A successful command, build, review, or partial implementation is not completion.

$PROMPT"

set +e
(
  cd "$WORKTREE"
  "$JAMES_BINARY" -z "$PROMPT"
) >"$OUTPUT_FILE" 2>"$ERROR_FILE"
EXIT_CODE=$?
set -e

if [[ -f "$REPO/.env" ]]; then
  set -a
  . "$REPO/.env"
  set +a
fi
PORT="${PORT:-4100}"
TOKEN="${MISSION_CONTROL_ADMIN_TOKEN:-${VITE_MISSION_CONTROL_ADMIN_TOKEN:-}}"

RESULT_STATE="$(node - "$EXIT_CODE" "$OUTPUT_FILE" <<'NODE'
const fs = require('fs');
const [exitCodeRaw, outPath] = process.argv.slice(2);
const exitCode = Number(exitCodeRaw);
const output = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';

if (exitCode !== 0) {
  process.stdout.write('FAILED');
  process.exit(0);
}

const allowed = new Set(['COMPLETED', 'IN_PROGRESS', 'CHANGES_REQUIRED', 'BLOCKED', 'FAILED', 'NEEDS_CLARIFICATION']);
const explicit = [...output.matchAll(/MISSION_CONTROL_RESULT\s*:\s*([A-Z_]+)/gi)].map(m => m[1].toUpperCase()).filter(v => allowed.has(v));
if (explicit.length) {
  process.stdout.write(explicit[explicit.length - 1]);
  process.exit(0);
}

const normalized = output.toUpperCase();
if (/^\s*BLOCKED\b/m.test(normalized) || /\bSTATUS\s*:\s*BLOCKED\b/.test(normalized)) process.stdout.write('BLOCKED');
else if (/\bNEEDS[_ ]CLARIFICATION\b/.test(normalized)) process.stdout.write('NEEDS_CLARIFICATION');
else if (/\bCHANGES[_ ]REQUIRED\b/.test(normalized)) process.stdout.write('CHANGES_REQUIRED');
else if (/\bNOT COMPLETE(?:D)?\b/.test(normalized) || /\bIN PROGRESS\b/.test(normalized) || /\bINCOMPLETE\b/.test(normalized)) process.stdout.write('IN_PROGRESS');
else if (/^\s*FAILED\b/m.test(normalized) || /\bSTATUS\s*:\s*FAILED\b/.test(normalized)) process.stdout.write('FAILED');
else if (/^\s*COMPLETED\b/m.test(normalized) || /\bSTATUS\s*:\s*COMPLETED\b/.test(normalized)) process.stdout.write('COMPLETED');
else process.stdout.write('IN_PROGRESS');
NODE
)"

printf '%s\n' "$RESULT_STATE" > "$STATUS_FILE"

for attempt in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/healthz" >/dev/null 2>&1; then break; fi
  sleep 2
done

PAYLOAD="$(node - "$TASK_ID" "$COMMAND_ID" "$JOB_ID" "$RESULT_STATE" "$EXIT_CODE" "$OUTPUT_FILE" "$ERROR_FILE" "$WORKTREE" <<'NODE'
const fs = require('fs');
const [taskId, commandId, jobId, resultState, exitCode, outPath, errPath, worktree] = process.argv.slice(2);
const output = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
const error = fs.existsSync(errPath) ? fs.readFileSync(errPath, 'utf8') : '';
process.stdout.write(JSON.stringify({
  taskId: Number(taskId),
  commandId: commandId ? Number(commandId) : null,
  jobId,
  resultState,
  exitCode: Number(exitCode),
  output,
  error,
  worktree,
}));
NODE
)"

curl -fsS -X POST "http://127.0.0.1:${PORT}/api/james/report" \
  -H 'Content-Type: application/json' \
  ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
  ${TOKEN:+-H "x-admin-token: $TOKEN"} \
  --data "$PAYLOAD" >/dev/null

rm -f "$PROMPT_FILE"
exit "$EXIT_CODE"
