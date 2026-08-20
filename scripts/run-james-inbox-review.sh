#!/usr/bin/env bash
set -Eeuo pipefail

JOB_ID="${1:?job id required}"
REPO="${MISSION_CONTROL_REPO_DIR:-/opt/apps/ai-mission-control}"
JAMES_BINARY="${JAMES_BINARY:-/usr/local/bin/james-hermes}"
STATE_DIR="/var/lib/ai-mission-control/james-jobs"
mkdir -p "$STATE_DIR"
if [[ -f "$REPO/.env" ]]; then set -a; . "$REPO/.env"; set +a; fi
PORT="${PORT:-4100}"
TOKEN="${MISSION_CONTROL_ADMIN_TOKEN:-${VITE_MISSION_CONTROL_ADMIN_TOKEN:-}}"
AUTH=()
if [[ -n "$TOKEN" ]]; then AUTH=(-H "Authorization: Bearer $TOKEN" -H "x-admin-token: $TOKEN"); fi
ITEMS="$(curl -fsS "http://127.0.0.1:${PORT}/api/inbox/unreviewed" "${AUTH[@]}")"
COUNT="$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(String(x.length))' "$ITEMS")"
if [[ "$COUNT" == "0" ]]; then exit 0; fi
PROMPT="Review these unreviewed Mission Control Inbox captures against known businesses and projects. Do not create tasks. Return only JSON in this exact shape: {\"reviews\":[{\"id\":1,\"comment\":\"concise factual recommendation\"}]}. Every supplied id must appear once. Prefer 'No immediate action recommended. Keep as reference.' over manufactured work. Inbox: $ITEMS"
OUTPUT="$STATE_DIR/$JOB_ID.inbox.json"
"$JAMES_BINARY" -z "$PROMPT" > "$OUTPUT"
PAYLOAD="$(node - "$OUTPUT" <<'NODE'
const fs=require('fs'); const raw=fs.readFileSync(process.argv[2],'utf8').trim();
const match=raw.match(/```(?:json)?\s*([\s\S]*?)```/i); const parsed=JSON.parse(match ? match[1] : raw);
if (!parsed || !Array.isArray(parsed.reviews)) throw new Error('Invalid James Inbox review output');
process.stdout.write(JSON.stringify({reviews:parsed.reviews}));
NODE
)"
curl -fsS -X POST "http://127.0.0.1:${PORT}/api/inbox/review-results" -H 'Content-Type: application/json' "${AUTH[@]}" --data "$PAYLOAD" >/dev/null
