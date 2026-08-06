#!/usr/bin/env bash
set -Eeuo pipefail

JOB_ID="${1:?job id required}"
TASK_ID="${2:?task id required}"
COMMAND_ID="${3:-}"
PROMPT_FILE="${4:?prompt file required}"
REPO="${MISSION_CONTROL_REPO_DIR:-/opt/apps/ai-mission-control}"
JAMES_BINARY="${JAMES_BINARY:-/usr/local/bin/james-hermes}"
STATE_DIR="/var/lib/ai-mission-control/james-jobs"
OUTPUT_FILE="$STATE_DIR/$JOB_ID.out"
ERROR_FILE="$STATE_DIR/$JOB_ID.err"
STATUS_FILE="$STATE_DIR/$JOB_ID.status"

mkdir -p "$STATE_DIR"
printf 'running\n' > "$STATUS_FILE"
PROMPT="$(cat "$PROMPT_FILE")"
set +e
"$JAMES_BINARY" -z "$PROMPT" >"$OUTPUT_FILE" 2>"$ERROR_FILE"
EXIT_CODE=$?
set -e

if [[ -f "$REPO/.env" ]]; then
  set -a
  . "$REPO/.env"
  set +a
fi
PORT="${PORT:-4100}"
TOKEN="${MISSION_CONTROL_ADMIN_TOKEN:-${VITE_MISSION_CONTROL_ADMIN_TOKEN:-}}"
STATUS="completed"
if [[ "$EXIT_CODE" -ne 0 ]]; then STATUS="failed"; fi
printf '%s\n' "$STATUS" > "$STATUS_FILE"

for attempt in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/healthz" >/dev/null 2>&1; then break; fi
  sleep 2
done

PAYLOAD="$(node - "$TASK_ID" "$COMMAND_ID" "$JOB_ID" "$STATUS" "$EXIT_CODE" "$OUTPUT_FILE" "$ERROR_FILE" <<'NODE'
const fs = require('fs');
const [taskId, commandId, jobId, status, exitCode, outPath, errPath] = process.argv.slice(2);
const output = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
const error = fs.existsSync(errPath) ? fs.readFileSync(errPath, 'utf8') : '';
process.stdout.write(JSON.stringify({ taskId: Number(taskId), commandId: commandId ? Number(commandId) : null, jobId, status, exitCode: Number(exitCode), output, error }));
NODE
)"

curl -fsS -X POST "http://127.0.0.1:${PORT}/api/james/report" \
  -H 'Content-Type: application/json' \
  ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
  ${TOKEN:+-H "x-admin-token: $TOKEN"} \
  --data "$PAYLOAD" >/dev/null

rm -f "$PROMPT_FILE"
exit "$EXIT_CODE"
