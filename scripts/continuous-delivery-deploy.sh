#!/usr/bin/env bash
set -Eeuo pipefail

# Approval-gated production deploy wrapper.
# This wrapper never chooses what to deploy. The controller passes the exact
# GitHub merge SHA authorized by the owner-approved execution envelope.

APP_ROOT="${MISSION_CONTROL_REPO_DIR:-/opt/apps/ai-mission-control}"
SERVICE_NAME="${MISSION_CONTROL_SERVICE_NAME:-ai-mission-control-api.service}"
PUBLIC_ORIGIN="${MISSION_CONTROL_PUBLIC_ORIGIN:-https://mission.customli.io}"
PORT="${PORT:-4100}"
LOCK_FILE="${MISSION_CONTROL_DELIVERY_LOCK:-/run/lock/mission-control-production-delivery.lock}"
EXPECTED_SHA="${1:-}"

if [[ ! "${EXPECTED_SHA}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: exact 40-character target SHA is required" >&2
  exit 64
fi
EXPECTED_SHA="${EXPECTED_SHA,,}"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "ERROR: another production delivery is already running" >&2
  exit 75
fi

cd "${APP_ROOT}"
if [[ ! -d .git ]]; then
  echo "ERROR: production checkout is missing: ${APP_ROOT}" >&2
  exit 66
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: production checkout is dirty; refusing autonomous deploy" >&2
  git status --short >&2
  exit 73
fi
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "ERROR: production checkout must be on main" >&2
  exit 73
fi

PREVIOUS_SHA="$(git rev-parse HEAD | tr '[:upper:]' '[:lower:]')"
ROLLBACK_STARTED=0
DEPLOY_STARTED=0

health_check() {
  curl -fsS --max-time 10 "http://127.0.0.1:${PORT}/api/healthz" >/dev/null \
    && curl -fsS --max-time 15 "${PUBLIC_ORIGIN}/api/healthz" >/dev/null \
    && curl -fsSI -L --max-time 15 "${PUBLIC_ORIGIN}/" >/dev/null
}

rollback() {
  local original_exit="$1"
  [[ "${DEPLOY_STARTED}" == "1" ]] || return "${original_exit}"
  [[ "${PREVIOUS_SHA}" != "${EXPECTED_SHA}" ]] || return "${original_exit}"

  ROLLBACK_STARTED=1
  trap - ERR
  set +e
  echo "ROLLBACK: restoring last known checkout ${PREVIOUS_SHA}" >&2
  git reset --hard "${PREVIOUS_SHA}" >&2
  pnpm install --frozen-lockfile >&2
  pnpm run build >&2
  systemctl restart "${SERVICE_NAME}" >&2
  local healthy=1
  for _ in $(seq 1 30); do
    if health_check; then healthy=0; break; fi
    sleep 1
  done
  if [[ "${healthy}" -eq 0 ]]; then
    echo "ROLLBACK_SUCCEEDED=${PREVIOUS_SHA}" >&2
  else
    echo "ROLLBACK_FAILED=${PREVIOUS_SHA}" >&2
  fi
  exit "${original_exit}"
}

on_error() {
  local rc=$?
  if [[ "${ROLLBACK_STARTED}" != "1" ]]; then rollback "${rc}"; fi
  exit "${rc}"
}
trap on_error ERR

echo "PREVIOUS_SHA=${PREVIOUS_SHA}"
git fetch origin main
REMOTE_MAIN="$(git rev-parse origin/main | tr '[:upper:]' '[:lower:]')"
if [[ "${REMOTE_MAIN}" != "${EXPECTED_SHA}" ]]; then
  echo "ERROR: authorized SHA ${EXPECTED_SHA} is not current origin/main ${REMOTE_MAIN}" >&2
  echo "This usually means another merge occurred after approval; a new approval envelope is required." >&2
  exit 78
fi

DEPLOY_STARTED=1
MISSION_CONTROL_EXPECTED_DEPLOY_SHA="${EXPECTED_SHA}" ./scripts/deploy-mission-control.sh

ACTUAL_SHA="$(git rev-parse HEAD | tr '[:upper:]' '[:lower:]')"
if [[ "${ACTUAL_SHA}" != "${EXPECTED_SHA}" ]]; then
  echo "ERROR: deployed checkout ${ACTUAL_SHA} does not equal authorized ${EXPECTED_SHA}" >&2
  exit 79
fi

for _ in $(seq 1 30); do
  if health_check; then
    echo "DEPLOYMENT_CERTIFIED_SHA=${ACTUAL_SHA}"
    echo "PREVIOUS_KNOWN_GOOD_SHA=${PREVIOUS_SHA}"
    exit 0
  fi
  sleep 1
done

echo "ERROR: final production certification failed" >&2
exit 80
