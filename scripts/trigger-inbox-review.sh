#!/usr/bin/env bash
set -Eeuo pipefail
REPO="${MISSION_CONTROL_REPO_DIR:-/opt/apps/ai-mission-control}"
if [[ -f "$REPO/.env" ]]; then set -a; . "$REPO/.env"; set +a; fi
TOKEN="${MISSION_CONTROL_ADMIN_TOKEN:-${VITE_MISSION_CONTROL_ADMIN_TOKEN:-}}"
AUTH=()
if [[ -n "$TOKEN" ]]; then AUTH=(-H "Authorization: Bearer $TOKEN" -H "x-admin-token: $TOKEN"); fi
curl -fsS -X POST "http://127.0.0.1:${PORT:-4100}/api/james/inbox-review" "${AUTH[@]}" >/dev/null
