#!/usr/bin/env bash
set -Eeuo pipefail

JOB_ID="${1:?job id required}"
TASK_ID="${2:?task id required}"
COMMAND_ID="${3:-}"
PROMPT_FILE="${4:?prompt file required}"
REPO="${5:-${MISSION_CONTROL_REPO_DIR:-/opt/apps/ai-mission-control}}"
JAMES_BINARY="${JAMES_BINARY:-/usr/local/bin/james-hermes}"
JAMES_PROFILE_DIR="${JAMES_PROFILE_DIR:-/root/.hermes/profiles/james-hermes}"
JAMES_PROFILE_ENV="${JAMES_PROFILE_ENV:-$JAMES_PROFILE_DIR/.env}"
JAMES_TASK_TIMEOUT_SECONDS="${JAMES_TASK_TIMEOUT_SECONDS:-900}"
MISSION_CONTROL_ENV="${MISSION_CONTROL_ENV:-/opt/apps/ai-mission-control/.env}"
STATE_DIR="/var/lib/ai-mission-control/james-jobs"
WORKTREE_ROOT="/var/lib/ai-mission-control/worktrees"
REPO_KEY="$(basename "$REPO" | tr -c 'A-Za-z0-9._-' '-')"
WORKTREE="$WORKTREE_ROOT/${REPO_KEY}-task-$TASK_ID"
OUTPUT_FILE="$STATE_DIR/$JOB_ID.out"
ERROR_FILE="$STATE_DIR/$JOB_ID.err"
STATUS_FILE="$STATE_DIR/$JOB_ID.status"

mkdir -p "$STATE_DIR" "$WORKTREE_ROOT"
printf 'running\n' > "$STATUS_FILE"

if ! git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf 'Configured execution repository is unavailable or not a git worktree: %s\n' "$REPO" > "$ERROR_FILE"
  printf 'BLOCKED\n' > "$STATUS_FILE"
  exit 78
fi

# Detached systemd jobs do not inherit the interactive shell configuration.
# Mission Control callback credentials must come from Mission Control itself, not
# from the task execution repository. Execution-repo env may then add task-local
# settings, while the James profile remains authoritative for model credentials.
if [[ -f "$MISSION_CONTROL_ENV" ]]; then
  set -a
  . "$MISSION_CONTROL_ENV"
  set +a
fi
if [[ -f "$REPO/.env" && "$REPO/.env" != "$MISSION_CONTROL_ENV" ]]; then
  set -a
  . "$REPO/.env"
  set +a
fi
if [[ ! -f "$JAMES_PROFILE_ENV" ]]; then
  printf 'James profile environment is missing: %s\n' "$JAMES_PROFILE_ENV" > "$ERROR_FILE"
  printf 'BLOCKED\n' > "$STATUS_FILE"
  exit 78
fi
set -a
. "$JAMES_PROFILE_ENV"
set +a
if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  printf 'James profile environment does not provide OPENROUTER_API_KEY: %s\n' "$JAMES_PROFILE_ENV" > "$ERROR_FILE"
  printf 'BLOCKED\n' > "$STATUS_FILE"
  exit 78
fi

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
  timeout --signal=TERM --kill-after=15s "$JAMES_TASK_TIMEOUT_SECONDS" "$JAMES_BINARY" -z "$PROMPT"
) >"$OUTPUT_FILE" 2>"$ERROR_FILE"
EXIT_CODE=$?
set -e

# Paid-provider capacity must not strand ordinary work when the authorized free
# router is available. Preserve the primary evidence, then retry once through the
# bounded free fallback. Authentication failures are never retried here.
if grep -Eqi 'HTTP 402|prompt tokens limit exceeded|requires more credits|insufficient credits|credit limit|quota exceeded|key limit exceeded' "$OUTPUT_FILE" "$ERROR_FILE" 2>/dev/null; then
  mv "$OUTPUT_FILE" "$OUTPUT_FILE.primary"
  mv "$ERROR_FILE" "$ERROR_FILE.primary"
  set +e
  (
    cd "$WORKTREE"
    export MAX_TOKENS="${JAMES_FALLBACK_MAX_TOKENS:-1200}"
    export OPENROUTER_MAX_TOKENS="${JAMES_FALLBACK_MAX_TOKENS:-1200}"
    export HERMES_MAX_TOKENS="${JAMES_FALLBACK_MAX_TOKENS:-1200}"
    timeout --signal=TERM --kill-after=15s "$JAMES_TASK_TIMEOUT_SECONDS" "$JAMES_BINARY" \
      --provider "${JAMES_FALLBACK_PROVIDER:-openrouter}" \
      -m "${JAMES_FALLBACK_MODEL:-openrouter/free}" -z "$PROMPT"
  ) >"$OUTPUT_FILE" 2>"$ERROR_FILE"
  EXIT_CODE=$?
  set -e
fi

if [[ "$EXIT_CODE" -eq 124 || "$EXIT_CODE" -eq 137 ]]; then
  printf '\nMission Control terminated James after %ss without a completed runtime response.\n' "$JAMES_TASK_TIMEOUT_SECONDS" >> "$ERROR_FILE"
fi

MC_PORT="${MISSION_CONTROL_PORT:-4100}"
TOKEN="${MISSION_CONTROL_ADMIN_TOKEN:-${VITE_MISSION_CONTROL_ADMIN_TOKEN:-}}"

RESULT_STATE="$(node - "$EXIT_CODE" "$OUTPUT_FILE" <<'NODE'
const fs = require('fs');
const [exitCodeRaw, outPath] = process.argv.slice(2);
const exitCode = Number(exitCodeRaw);
const output = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
if (exitCode !== 0) { process.stdout.write('FAILED'); process.exit(0); }
const allowed = new Set(['COMPLETED', 'IN_PROGRESS', 'CHANGES_REQUIRED', 'BLOCKED', 'FAILED', 'NEEDS_CLARIFICATION']);
const explicit = [...output.matchAll(/MISSION_CONTROL_RESULT\s*:\s*([A-Z_]+)/gi)].map(m => m[1].toUpperCase()).filter(v => allowed.has(v));
if (explicit.length) { process.stdout.write(explicit[explicit.length - 1]); process.exit(0); }
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
  if curl --connect-timeout 3 --max-time 5 -fsS "http://127.0.0.1:${MC_PORT}/api/healthz" >/dev/null 2>&1; then break; fi
  sleep 2
done

PAYLOAD="$(node - "$TASK_ID" "$COMMAND_ID" "$JOB_ID" "$RESULT_STATE" "$EXIT_CODE" "$OUTPUT_FILE" "$ERROR_FILE" "$WORKTREE" <<'NODE'
const fs = require('fs');
const [taskId, commandId, jobId, resultState, exitCode, outPath, errPath, worktree] = process.argv.slice(2);
const output = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
const error = fs.existsSync(errPath) ? fs.readFileSync(errPath, 'utf8') : '';
process.stdout.write(JSON.stringify({ taskId: Number(taskId), commandId: commandId ? Number(commandId) : null, jobId, resultState, exitCode: Number(exitCode), output, error, worktree }));
NODE
)"

curl --connect-timeout 3 --max-time 15 --fail-with-body -sS -X POST "http://127.0.0.1:${MC_PORT}/api/james/report" \
  -H 'Content-Type: application/json' \
  ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
  ${TOKEN:+-H "x-admin-token: $TOKEN"} \
  --data-binary "$PAYLOAD" >/dev/null

rm -f "$PROMPT_FILE"
exit "$EXIT_CODE"
