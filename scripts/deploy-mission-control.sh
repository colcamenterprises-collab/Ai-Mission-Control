#!/usr/bin/env bash
set -Eeuo pipefail

EXPECTED_REPO_ROOT="/opt/apps/ai-mission-control"
SERVICE_NAME="ai-mission-control-api.service"
REMOTE_NAME="origin"
DEPLOY_BRANCH="main"
LOG_LINES="${MISSION_CONTROL_DEPLOY_LOG_LINES:-100}"
PNPM_CMD=""

step_name="initialization"

on_error() {
  local exit_code=$?
  echo "" >&2
  echo "ERROR: deployment failed during: ${step_name}" >&2
  echo "Exit code: ${exit_code}" >&2
  echo "No fake success: deployment did not complete." >&2
  exit "${exit_code}"
}
trap on_error ERR

log() {
  printf '\n==> %s\n' "$*"
}

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "ERROR: required command not found: ${cmd}" >&2
    exit 1
  fi
}

resolve_pnpm_cmd() {
  if command -v pnpm >/dev/null 2>&1; then
    PNPM_CMD="$(command -v pnpm)"
  elif [[ -x "/root/.hermes/node/bin/pnpm" ]]; then
    PNPM_CMD="/root/.hermes/node/bin/pnpm"
  elif command -v npm >/dev/null 2>&1; then
    PNPM_CMD="npm exec --yes pnpm@10 --"
  else
    echo "pnpm is not available and could not be resolved. Install pnpm or fix PATH before deploying." >&2
    exit 1
  fi

  echo "Resolved pnpm command: ${PNPM_CMD}"
}

run_pnpm() {
  local -a pnpm_parts
  read -r -a pnpm_parts <<< "${PNPM_CMD}"
  "${pnpm_parts[@]}" "$@"
}

resolve_repo_root() {
  if [[ "${PWD}" == "${EXPECTED_REPO_ROOT}" ]]; then
    printf '%s\n' "${EXPECTED_REPO_ROOT}"
    return 0
  fi

  local root
  root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "${root}" ]]; then
    printf '%s\n' "${root}"
    return 0
  fi

  if [[ -d "${EXPECTED_REPO_ROOT}/.git" ]]; then
    printf '%s\n' "${EXPECTED_REPO_ROOT}"
    return 0
  fi

  echo "ERROR: not running from a Git checkout and ${EXPECTED_REPO_ROOT} was not found." >&2
  exit 1
}

get_service_environment_value() {
  local key="$1"
  systemctl show "${SERVICE_NAME}" --property=Environment --value 2>/dev/null \
    | tr ' ' '\n' \
    | awk -F= -v key="${key}" '$1 == key { sub("^[^=]*=", ""); print; exit }'
}

ensure_runtime_env() {
  if [[ -z "${PORT:-}" ]]; then
    PORT="$(get_service_environment_value PORT || true)"
    if [[ -n "${PORT}" ]]; then
      export PORT
      echo "Loaded PORT from ${SERVICE_NAME} systemd environment."
    fi
  fi

  if [[ -z "${MISSION_CONTROL_ADMIN_TOKEN:-}" ]]; then
    MISSION_CONTROL_ADMIN_TOKEN="$(get_service_environment_value MISSION_CONTROL_ADMIN_TOKEN || true)"
    if [[ -n "${MISSION_CONTROL_ADMIN_TOKEN}" ]]; then
      export MISSION_CONTROL_ADMIN_TOKEN
      echo "Loaded MISSION_CONTROL_ADMIN_TOKEN from ${SERVICE_NAME} systemd environment."
    fi
  fi

  if [[ -z "${VITE_MISSION_CONTROL_ADMIN_TOKEN:-}" ]]; then
    VITE_MISSION_CONTROL_ADMIN_TOKEN="$(get_service_environment_value VITE_MISSION_CONTROL_ADMIN_TOKEN || true)"
    if [[ -n "${VITE_MISSION_CONTROL_ADMIN_TOKEN}" ]]; then
      export VITE_MISSION_CONTROL_ADMIN_TOKEN
      echo "Loaded VITE_MISSION_CONTROL_ADMIN_TOKEN from ${SERVICE_NAME} systemd environment."
    fi
  fi

  if [[ -z "${BASE_PATH:-}" ]]; then
    BASE_PATH="$(get_service_environment_value BASE_PATH || true)"
    if [[ -n "${BASE_PATH}" ]]; then
      export BASE_PATH
      echo "Loaded BASE_PATH from ${SERVICE_NAME} systemd environment."
    fi
  fi
}

run_smoke_if_available() {
  if node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['smoke:operational'] ? 0 : 1)"; then
    if [[ -z "${PORT:-}" ]]; then
      echo "ERROR: PORT is required for smoke:operational." >&2
      exit 1
    fi
    if [[ -z "${MISSION_CONTROL_ADMIN_TOKEN:-${VITE_MISSION_CONTROL_ADMIN_TOKEN:-}}" ]]; then
      echo "ERROR: MISSION_CONTROL_ADMIN_TOKEN or VITE_MISSION_CONTROL_ADMIN_TOKEN is required for smoke:operational." >&2
      exit 1
    fi
    MISSION_CONTROL_SMOKE_BASE_URL="${MISSION_CONTROL_SMOKE_BASE_URL:-http://127.0.0.1:${PORT}}" \
      MISSION_CONTROL_ADMIN_TOKEN="${MISSION_CONTROL_ADMIN_TOKEN:-${VITE_MISSION_CONTROL_ADMIN_TOKEN}}" \
      run_pnpm run smoke:operational
  else
    echo "No smoke:operational script is available; skipping smoke check."
  fi
}

curl_verify() {
  local url="$1"
  shift
  curl -fsS "$@" "${url}" >/dev/null
  echo "Verified ${url}"
}

step_name="checking prerequisites"
log "Checking prerequisites"
require_command git
require_command node
resolve_pnpm_cmd
require_command systemctl
require_command journalctl
require_command curl

step_name="resolving repository root"
repo_root="$(resolve_repo_root)"
cd "${repo_root}"

log "Repository"
echo "Resolved repo root: ${repo_root}"
if [[ "${repo_root}" != "${EXPECTED_REPO_ROOT}" ]]; then
  echo "WARNING: expected production repo root is ${EXPECTED_REPO_ROOT}; using resolved checkout ${repo_root}."
fi

step_name="showing current branch and commit"
current_branch="$(git branch --show-current)"
current_commit="$(git rev-parse HEAD)"
echo "Current branch: ${current_branch:-DETACHED}"
echo "Current commit: ${current_commit}"

step_name="checking working tree status"
log "Checking working tree status"
git status --short
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: refusing to deploy: working tree has local changes." >&2
  echo "No local files are documented as safe to ignore for deployment." >&2
  exit 1
fi

if [[ "${current_branch}" != "${DEPLOY_BRANCH}" ]]; then
  echo "ERROR: refusing to deploy from branch '${current_branch:-DETACHED}'. Expected '${DEPLOY_BRANCH}'." >&2
  exit 1
fi

ensure_runtime_env

step_name="fetching latest main"
log "Fetching latest ${DEPLOY_BRANCH}"
git fetch "${REMOTE_NAME}" "${DEPLOY_BRANCH}"

step_name="pulling latest main"
log "Pulling latest ${DEPLOY_BRANCH} with fast-forward only"
git pull --ff-only "${REMOTE_NAME}" "${DEPLOY_BRANCH}"

step_name="installing dependencies"
log "Installing dependencies"
run_pnpm install --frozen-lockfile

step_name="building"
log "Building"
run_pnpm run build

step_name="running typecheck"
log "Running typecheck"
run_pnpm run typecheck

step_name="running skills test"
log "Running skills test"
run_pnpm run test:skills

step_name="running smoke check"
log "Running smoke check if available"
run_smoke_if_available

step_name="restarting ${SERVICE_NAME}"
log "Restarting ${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

step_name="showing service status"
log "Service status"
sudo systemctl status "${SERVICE_NAME}" --no-pager

step_name="showing recent service logs"
log "Recent service logs"
sudo journalctl -u "${SERVICE_NAME}" -n "${LOG_LINES}" --no-pager

step_name="post-restart verification"
log "Post-restart verification"
if [[ -z "${PORT:-}" ]]; then
  echo "ERROR: PORT is required for post-restart verification." >&2
  exit 1
fi
base_url="http://127.0.0.1:${PORT}"
admin_token="${MISSION_CONTROL_ADMIN_TOKEN:-${VITE_MISSION_CONTROL_ADMIN_TOKEN:-}}"

curl_verify "${base_url}/api/healthz"
if [[ -n "${admin_token}" ]]; then
  curl_verify "${base_url}/api/skills" -H "Authorization: Bearer ${admin_token}"
else
  echo "WARNING: admin token unavailable; skipping authenticated route curl verification."
fi

step_name="printing deployment summary"
deployed_commit="$(git rev-parse HEAD)"
log "Deployment complete"
echo "Deployed commit SHA: ${deployed_commit}"
echo "Verification URLs/routes:"
echo "  ${base_url}/api/healthz"
echo "  ${base_url}/api/skills"
echo "  ${base_url}/api/tasks"
echo "  ${base_url}/api/agents"
echo "  ${base_url}/api/worktrees/diagnostics"
echo "  https://mission.customli.io/api/healthz"
echo "  https://mission.customli.io/api/skills"
