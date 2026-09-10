#!/usr/bin/env bash
set -Eeuo pipefail

# Mission Control safe deployment script.
# This script is intentionally conservative:
# - deploys only from a clean main checkout
# - pulls with --ff-only
# - installs/builds/tests the app
# - restarts only the confirmed Mission Control API systemd service plus the
#   existing root user OpenClaw gateway when its credential environment is present
# - verifies local and public health routes
# - runs only the repository's additive, idempotent schema check; it never
#   runs Drizzle push/force, drops tables, renames columns, or rewrites data
# - does not edit nginx
# - does not print secrets

EXPECTED_REPO_ROOT="${MISSION_CONTROL_REPO_DIR:-/opt/apps/ai-mission-control}"
SERVICE_NAME="${MISSION_CONTROL_SERVICE_NAME:-ai-mission-control-api.service}"
REMOTE_NAME="${MISSION_CONTROL_DEPLOY_REMOTE:-origin}"
DEPLOY_BRANCH="${MISSION_CONTROL_DEPLOY_BRANCH:-main}"
PUBLIC_ORIGIN="${MISSION_CONTROL_PUBLIC_ORIGIN:-https://mission.customli.io}"
FRONTEND_DIST="${MISSION_CONTROL_FRONTEND_DIST:-artifacts/mission-control/dist/public}"
DEFAULT_PORT="${MISSION_CONTROL_DEFAULT_PORT:-4100}"
LOG_LINES="${MISSION_CONTROL_DEPLOY_LOG_LINES:-100}"
HEALTH_RETRIES="${MISSION_CONTROL_HEALTH_RETRIES:-30}"
HEALTH_SLEEP_SECONDS="${MISSION_CONTROL_HEALTH_SLEEP_SECONDS:-1}"
SKIP_TESTS="${MISSION_CONTROL_DEPLOY_SKIP_TESTS:-0}"
JAMES_PROFILE_DIR="${JAMES_PROFILE_DIR:-/root/.hermes/profiles/james-hermes}"
JAMES_PROFILE_ENV="${JAMES_PROFILE_ENV:-${JAMES_PROFILE_DIR}/.env}"
OPENCLAW_ENV="${OPENCLAW_ENV:-/root/.openclaw/.env}"
OPENCLAW_SERVICE="${OPENCLAW_SERVICE:-openclaw-gateway.service}"
OPENCLAW_DROPIN_DIR="${OPENCLAW_DROPIN_DIR:-/root/.config/systemd/user/${OPENCLAW_SERVICE}.d}"
OPENCLAW_DROPIN_FILE="${OPENCLAW_DROPIN_FILE:-${OPENCLAW_DROPIN_DIR}/mission-control-openrouter.conf}"
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

log() { printf '\n==> %s\n' "$*"; }

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "ERROR: required command not found: ${cmd}" >&2
    exit 1
  fi
}

as_root() {
  if [[ "${EUID}" -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

root_user_systemctl() {
  if [[ "${EUID}" -eq 0 ]]; then
    XDG_RUNTIME_DIR="/run/user/0" systemctl --user "$@"
  else
    sudo -u root env XDG_RUNTIME_DIR="/run/user/0" systemctl --user "$@"
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
    echo "ERROR: pnpm is not available and could not be resolved." >&2
    exit 1
  fi
  if [[ "${PNPM_CMD}" == /* ]]; then export PATH="$(dirname "${PNPM_CMD}"):${PATH}"; fi
  echo "Resolved pnpm command: ${PNPM_CMD}"
}

run_pnpm() { local -a pnpm_parts; read -r -a pnpm_parts <<< "${PNPM_CMD}"; "${pnpm_parts[@]}" "$@"; }

resolve_repo_root() {
  if [[ "${PWD}" == "${EXPECTED_REPO_ROOT}" && -d "${EXPECTED_REPO_ROOT}/.git" ]]; then printf '%s\n' "${EXPECTED_REPO_ROOT}"; return 0; fi
  local root; root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "${root}" ]]; then printf '%s\n' "${root}"; return 0; fi
  if [[ -d "${EXPECTED_REPO_ROOT}/.git" ]]; then printf '%s\n' "${EXPECTED_REPO_ROOT}"; return 0; fi
  echo "ERROR: not running from a Git checkout and ${EXPECTED_REPO_ROOT} was not found." >&2
  exit 1
}

package_has_script() { local script_name="$1"; node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync("package.json","utf8")); process.exit(p.scripts && p.scripts[process.argv[1]] ? 0 : 1)' "${script_name}"; }

get_service_environment_value() {
  local key="$1"
  systemctl show "${SERVICE_NAME}" --property=Environment --value 2>/dev/null \
    | tr ' ' '\n' \
    | awk -F= -v key="${key}" '$1 == key { sub("^[^=]*=", ""); print; exit }'
}

load_dotenv_if_available() {
  local env_file="${repo_root}/.env"
  if [[ ! -f "${env_file}" ]]; then echo "No .env file found; continuing with existing environment and systemd fallbacks."; return 0; fi
  set -a
  # shellcheck disable=SC1090
  . "${env_file}"
  set +a
  if [[ -n "${DATABASE_URL:-}" ]]; then echo "DATABASE_URL present"; else echo "DATABASE_URL missing"; fi
  if [[ -n "${MISSION_CONTROL_ADMIN_TOKEN:-${VITE_MISSION_CONTROL_ADMIN_TOKEN:-}}" ]]; then echo "admin token present"; else echo "admin token missing"; fi
}

ensure_runtime_env() {
  if [[ -z "${PORT:-}" ]]; then
    PORT="$(get_service_environment_value PORT || true)"
    if [[ -n "${PORT}" ]]; then echo "Loaded PORT from ${SERVICE_NAME} systemd environment."; fi
  fi
  PORT="${PORT:-${DEFAULT_PORT}}"; export PORT
  if [[ -z "${MISSION_CONTROL_ADMIN_TOKEN:-}" ]]; then
    MISSION_CONTROL_ADMIN_TOKEN="$(get_service_environment_value MISSION_CONTROL_ADMIN_TOKEN || true)"
    if [[ -n "${MISSION_CONTROL_ADMIN_TOKEN}" ]]; then export MISSION_CONTROL_ADMIN_TOKEN; echo "Loaded MISSION_CONTROL_ADMIN_TOKEN from ${SERVICE_NAME} systemd environment."; fi
  fi
  if [[ -z "${VITE_MISSION_CONTROL_ADMIN_TOKEN:-}" ]]; then
    VITE_MISSION_CONTROL_ADMIN_TOKEN="$(get_service_environment_value VITE_MISSION_CONTROL_ADMIN_TOKEN || true)"
    if [[ -n "${VITE_MISSION_CONTROL_ADMIN_TOKEN}" ]]; then export VITE_MISSION_CONTROL_ADMIN_TOKEN; echo "Loaded VITE_MISSION_CONTROL_ADMIN_TOKEN from ${SERVICE_NAME} systemd environment."; fi
  fi
  echo "Resolved PORT: ${PORT}"
  echo "Public origin: ${PUBLIC_ORIGIN}"
}

ensure_james_profile_environment() {
  if [[ ! -f "${JAMES_PROFILE_ENV}" ]]; then
    echo "ERROR: James profile environment is missing: ${JAMES_PROFILE_ENV}" >&2
    return 1
  fi
  if ! grep -qE '^[[:space:]]*(export[[:space:]]+)?OPENROUTER_API_KEY=' "${JAMES_PROFILE_ENV}"; then
    echo "ERROR: James profile environment does not declare OPENROUTER_API_KEY: ${JAMES_PROFILE_ENV}" >&2
    return 1
  fi
  local dropin_dir="/etc/systemd/system/${SERVICE_NAME}.d"
  local dropin_file="${dropin_dir}/james-profile-env.conf"
  as_root install -d -m 755 "${dropin_dir}"
  printf '[Service]\nEnvironmentFile=%s\n' "${JAMES_PROFILE_ENV}" | as_root tee "${dropin_file}" >/dev/null
  as_root chmod 644 "${dropin_file}"
  as_root systemctl daemon-reload
  echo "James profile environment attached to ${SERVICE_NAME}: ${JAMES_PROFILE_ENV}"
  echo "OPENROUTER_API_KEY presence verified without printing the secret."
}

ensure_openclaw_gateway_environment() {
  if [[ ! -f "${OPENCLAW_ENV}" ]]; then
    echo "ERROR: OpenClaw environment is missing: ${OPENCLAW_ENV}" >&2
    return 1
  fi
  if ! grep -qE '^[[:space:]]*(export[[:space:]]+)?OPENROUTER_API_KEY=' "${OPENCLAW_ENV}"; then
    echo "ERROR: OpenClaw environment does not declare OPENROUTER_API_KEY: ${OPENCLAW_ENV}" >&2
    return 1
  fi
  if ! root_user_systemctl list-unit-files "${OPENCLAW_SERVICE}" --no-legend 2>/dev/null | grep -q "${OPENCLAW_SERVICE}"; then
    echo "ERROR: OpenClaw gateway user service is not installed: ${OPENCLAW_SERVICE}" >&2
    return 1
  fi
  as_root install -d -m 755 "${OPENCLAW_DROPIN_DIR}"
  printf '[Service]\nEnvironmentFile=%s\n' "${OPENCLAW_ENV}" | as_root tee "${OPENCLAW_DROPIN_FILE}" >/dev/null
  as_root chmod 644 "${OPENCLAW_DROPIN_FILE}"
  root_user_systemctl daemon-reload
  root_user_systemctl restart "${OPENCLAW_SERVICE}"
  root_user_systemctl is-active --quiet "${OPENCLAW_SERVICE}"
  local env_files pid
  env_files="$(root_user_systemctl show "${OPENCLAW_SERVICE}" --property=EnvironmentFiles --value)"
  if [[ "${env_files}" != *"${OPENCLAW_ENV}"* ]]; then
    echo "ERROR: OpenClaw gateway did not register ${OPENCLAW_ENV}." >&2
    return 1
  fi
  pid="$(root_user_systemctl show "${OPENCLAW_SERVICE}" --property=MainPID --value)"
  if [[ -z "${pid}" || "${pid}" == "0" || ! -r "/proc/${pid}/environ" ]]; then
    echo "ERROR: OpenClaw gateway has no readable running process." >&2
    return 1
  fi
  if ! tr '\0' '\n' < "/proc/${pid}/environ" | grep -q '^OPENROUTER_API_KEY='; then
    echo "ERROR: running OpenClaw gateway did not receive OPENROUTER_API_KEY." >&2
    return 1
  fi
  echo "OpenClaw gateway environment attached and live process credential presence verified without printing the secret."
}

wait_for_url() {
  local label="$1" url="$2"; shift 2
  local attempt
  for attempt in $(seq 1 "${HEALTH_RETRIES}"); do
    if curl -fsS "$@" "${url}" >/dev/null 2>&1; then echo "${label} passed on attempt ${attempt}/${HEALTH_RETRIES}: ${url}"; return 0; fi
    echo "Waiting for ${label}... attempt ${attempt}/${HEALTH_RETRIES}"; sleep "${HEALTH_SLEEP_SECONDS}"
  done
  echo "ERROR: ${label} failed after ${HEALTH_RETRIES} attempts: ${url}" >&2
  return 1
}

run_optional_script() { local script_name="$1"; if package_has_script "${script_name}"; then run_pnpm run "${script_name}"; else echo "No ${script_name} script is available; skipping."; fi; }

step_name="checking prerequisites"
log "Checking prerequisites"
require_command git; require_command node; require_command npm; resolve_pnpm_cmd; require_command systemctl; require_command journalctl; require_command curl

step_name="resolving repository root"
repo_root="$(resolve_repo_root)"; cd "${repo_root}"
log "Repository"
echo "Resolved repo root: ${repo_root}"
if [[ "${repo_root}" != "${EXPECTED_REPO_ROOT}" ]]; then echo "WARNING: expected production repo root is ${EXPECTED_REPO_ROOT}; using resolved checkout ${repo_root}."; fi

step_name="loading environment"
log "Loading environment"
load_dotenv_if_available
ensure_runtime_env

step_name="showing current branch and commit"
current_branch="$(git branch --show-current)"; current_commit="$(git rev-parse HEAD)"
echo "Current branch: ${current_branch:-DETACHED}"
echo "Current commit: ${current_commit}"

step_name="checking working tree status"
log "Checking working tree status"
git status --short
if [[ -n "$(git status --porcelain)" ]]; then echo "ERROR: refusing to deploy: working tree has local changes." >&2; exit 1; fi
if [[ "${current_branch}" != "${DEPLOY_BRANCH}" ]]; then echo "ERROR: refusing to deploy from branch '${current_branch:-DETACHED}'. Expected '${DEPLOY_BRANCH}'." >&2; exit 1; fi

step_name="fetching latest branch"
log "Fetching latest ${DEPLOY_BRANCH}"
git fetch "${REMOTE_NAME}" "${DEPLOY_BRANCH}"

step_name="pulling latest branch"
log "Pulling latest ${DEPLOY_BRANCH} with fast-forward only"
git pull --ff-only "${REMOTE_NAME}" "${DEPLOY_BRANCH}"

step_name="installing dependencies"
log "Installing dependencies"
run_pnpm install --frozen-lockfile

step_name="checking operational database schema"
log "Checking operational database schema"
run_pnpm run db:ensure-operational-schema

step_name="building workspace"
log "Building workspace"
run_pnpm run build

step_name="verifying frontend build output"
log "Verifying frontend build output"
if [[ ! -f "${FRONTEND_DIST}/index.html" ]]; then echo "ERROR: frontend build output missing: ${FRONTEND_DIST}/index.html" >&2; exit 1; fi
echo "Verified frontend build output: ${FRONTEND_DIST}/index.html"

if [[ "${SKIP_TESTS}" == "1" ]]; then
  echo "MISSION_CONTROL_DEPLOY_SKIP_TESTS=1; skipping optional tests."
else
  step_name="running skills test"; log "Running skills test"; run_optional_script "test:skills"
fi

step_name="checking nginx syntax"
log "Checking nginx syntax"
if command -v nginx >/dev/null 2>&1; then as_root nginx -t; else echo "nginx command not found; skipping nginx syntax check."; fi

step_name="attaching James runtime environment"
log "Attaching James runtime environment"
ensure_james_profile_environment

step_name="attaching OpenClaw runtime environment"
log "Attaching OpenClaw runtime environment"
ensure_openclaw_gateway_environment

step_name="restarting service"
log "Restarting ${SERVICE_NAME}"
as_root systemctl restart "${SERVICE_NAME}"

step_name="showing service status"
log "Service status"
as_root systemctl status "${SERVICE_NAME}" --no-pager -n 30 || true

step_name="showing recent service logs"
log "Recent service logs"
as_root journalctl -u "${SERVICE_NAME}" -n "${LOG_LINES}" --no-pager || true

step_name="installing daily Inbox review timer"
log "Installing daily Inbox review timer"
as_root "${repo_root}/scripts/install-inbox-review-timer.sh"

step_name="post-restart verification"
log "Post-restart verification"
base_url="http://127.0.0.1:${PORT}"
admin_token="${MISSION_CONTROL_ADMIN_TOKEN:-${VITE_MISSION_CONTROL_ADMIN_TOKEN:-}}"
wait_for_url "local API health check" "${base_url}/api/healthz"
wait_for_url "public API health check" "${PUBLIC_ORIGIN}/api/healthz"
if [[ -n "${admin_token}" ]]; then wait_for_url "authenticated local skills check" "${base_url}/api/skills" -H "Authorization: Bearer ${admin_token}"; else echo "WARNING: admin token unavailable; skipping authenticated skills verification."; fi

step_name="frontend public check"
log "Frontend public check"
curl -I -L --max-time 15 "${PUBLIC_ORIGIN}/"

step_name="printing deployment summary"
deployed_commit="$(git rev-parse HEAD)"
log "Deployment complete"
echo "Deployed commit SHA: ${deployed_commit}"
echo "Service: ${SERVICE_NAME}"
echo "Local API: ${base_url}/api/healthz"
echo "Public API: ${PUBLIC_ORIGIN}/api/healthz"
echo "Frontend: ${PUBLIC_ORIGIN}/"
echo "Frontend build output: ${FRONTEND_DIST}"
echo "James profile environment: ${JAMES_PROFILE_ENV} (secret values not printed)"
echo "OpenClaw gateway environment: ${OPENCLAW_ENV} (secret values not printed)"
echo "Operational database schema check completed (additive only; no Drizzle push)."
