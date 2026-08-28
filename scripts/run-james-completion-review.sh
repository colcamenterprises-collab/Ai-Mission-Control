#!/usr/bin/env bash
set -Eeuo pipefail

JOB_ID="${1:?job id required}"
TASK_ID="${2:?task id required}"
WORKER_NAME="${3:?worker name required}"
PROMPT_FILE="${4:?prompt file required}"
REPO="${MISSION_CONTROL_REPO_DIR:-/opt/apps/ai-mission-control}"
JAMES_BINARY="${JAMES_BINARY:-/usr/local/bin/james-hermes}"
STATE_DIR="/var/lib/ai-mission-control/james-review-jobs"
OUTPUT_FILE="$STATE_DIR/$JOB_ID.out"
ERROR_FILE="$STATE_DIR/$JOB_ID.err"

mkdir -p "$STATE_DIR"
PROMPT="$(cat "$PROMPT_FILE")"
PROMPT="$PROMPT

At the END of your response emit these machine-readable lines exactly once:
MISSION_CONTROL_REVIEW: VERIFIED_COMPLETE or REWORK_REQUIRED
MISSION_CONTROL_REASON: one concise factual reason
MISSION_CONTROL_EVIDENCE_JSON: [\"evidence item\", \"evidence item\"]
MISSION_CONTROL_REWORK: corrective instructions when rework is required, otherwise empty
MISSION_CONTROL_OWNER_REVIEW: YES or NO
MISSION_CONTROL_OWNER_REVIEW_REASON: factual reason when YES, otherwise empty

Do not use VERIFIED_COMPLETE unless the result is genuinely satisfactory against the owner's original brief."

set +e
(
  cd "$REPO"
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

PAYLOAD="$(node - "$TASK_ID" "$WORKER_NAME" "$JOB_ID" "$EXIT_CODE" "$OUTPUT_FILE" "$ERROR_FILE" <<'NODE'
const fs = require('fs');
const [taskId, workerName, jobId, exitCodeRaw, outPath, errPath] = process.argv.slice(2);
const output = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
const error = fs.existsSync(errPath) ? fs.readFileSync(errPath, 'utf8') : '';
const last = (regex, fallback = '') => [...output.matchAll(regex)].map(m => m[1].trim()).pop() || fallback;
const decision = last(/MISSION_CONTROL_REVIEW\s*:\s*(VERIFIED_COMPLETE|REWORK_REQUIRED)/gi, 'REWORK_REQUIRED').toUpperCase();
const reason = last(/MISSION_CONTROL_REASON\s*:\s*(.+)$/gmi, Number(exitCodeRaw) === 0 ? 'James did not provide a valid review reason.' : `James review runner exited ${exitCodeRaw}.`);
const rework = last(/MISSION_CONTROL_REWORK\s*:\s*(.*)$/gmi, '');
const ownerReview = last(/MISSION_CONTROL_OWNER_REVIEW\s*:\s*(YES|NO)/gi, 'NO').toUpperCase() === 'YES';
const ownerReviewReason = last(/MISSION_CONTROL_OWNER_REVIEW_REASON\s*:\s*(.*)$/gmi, '');
let evidence = [];
const rawEvidence = last(/MISSION_CONTROL_EVIDENCE_JSON\s*:\s*(\[[^\n]*\])/gi, '[]');
try { const parsed = JSON.parse(rawEvidence); if (Array.isArray(parsed)) evidence = parsed.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()); } catch {}
process.stdout.write(JSON.stringify({ taskId: Number(taskId), workerName, jobId, exitCode: Number(exitCodeRaw), decision, reason, evidence, rework, ownerReview, ownerReviewReason, output, error }));
NODE
)"

for attempt in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/healthz" >/dev/null 2>&1; then break; fi
  sleep 2
done

curl -fsS -X POST "http://127.0.0.1:${PORT}/api/james/completion-review-report" \
  -H 'Content-Type: application/json' \
  ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
  ${TOKEN:+-H "x-admin-token: $TOKEN"} \
  --data "$PAYLOAD" >/dev/null

rm -f "$PROMPT_FILE"
exit 0
