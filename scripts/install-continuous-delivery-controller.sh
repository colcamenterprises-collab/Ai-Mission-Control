#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${MISSION_CONTROL_REPO_DIR:-/opt/apps/ai-mission-control}"
API_SERVICE="${MISSION_CONTROL_SERVICE_NAME:-ai-mission-control-api.service}"
CONTROLLER_SERVICE="mission-control-continuous-delivery.service"
ENV_DIR="/etc/mission-control"
ENV_FILE="/etc/mission-control/continuous-delivery.env"
NODE_BIN="${MISSION_CONTROL_NODE_BIN:-$(command -v node || true)}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: installer must run as root" >&2
  exit 1
fi
if [[ -z "${NODE_BIN}" || ! -x "${NODE_BIN}" ]]; then
  echo "ERROR: node is required" >&2
  exit 1
fi
for command in git gh codex pnpm flock systemctl curl; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "ERROR: required command missing: ${command}" >&2
    exit 1
  fi
done
if [[ ! -d "${APP_ROOT}/.git" ]]; then
  echo "ERROR: Mission Control checkout not found at ${APP_ROOT}" >&2
  exit 1
fi
if [[ ! -f "${APP_ROOT}/scripts/continuous-delivery-controller.mjs" || ! -f "${APP_ROOT}/scripts/continuous-delivery-deploy.sh" ]]; then
  echo "ERROR: continuous-delivery files are not present in the production checkout" >&2
  exit 1
fi

gh auth status >/dev/null 2>&1 || {
  echo "ERROR: root gh CLI is not authenticated; authenticate GitHub before enabling production delivery" >&2
  exit 1
}
gh auth setup-git >/dev/null 2>&1 || {
  echo "ERROR: root gh CLI could not configure non-interactive Git credentials" >&2
  exit 1
}
codex --version >/dev/null 2>&1 || {
  echo "ERROR: Codex CLI is not operational for root" >&2
  exit 1
}

extract_service_env() {
  local key="$1"
  systemctl show "${API_SERVICE}" --property=Environment --value 2>/dev/null \
    | tr ' ' '\n' \
    | awk -F= -v key="${key}" '$1 == key { sub("^[^=]*=", ""); print; exit }'
}

ADMIN_TOKEN="${MISSION_CONTROL_ADMIN_TOKEN:-$(extract_service_env MISSION_CONTROL_ADMIN_TOKEN || true)}"
if [[ -z "${ADMIN_TOKEN}" ]]; then
  ADMIN_TOKEN="${VITE_MISSION_CONTROL_ADMIN_TOKEN:-$(extract_service_env VITE_MISSION_CONTROL_ADMIN_TOKEN || true)}"
fi
if [[ -z "${ADMIN_TOKEN}" ]]; then
  echo "ERROR: Mission Control admin token is not available from environment or ${API_SERVICE}" >&2
  exit 1
fi

install -d -m 700 "${ENV_DIR}"
install -d -m 700 /var/lib/ai-mission-control/continuous-delivery
umask 077
{
  printf 'MISSION_CONTROL_ADMIN_TOKEN=%q\n' "${ADMIN_TOKEN}"
  printf 'MISSION_CONTROL_API_BASE=%q\n' "http://127.0.0.1:4100/api"
  printf 'MISSION_CONTROL_REPO_DIR=%q\n' "${APP_ROOT}"
  printf 'MISSION_CONTROL_CODEX_REMEDIATION_ENABLED=%q\n' "1"
  printf 'MISSION_CONTROL_DELIVERY_POLL_MS=%q\n' "30000"
} > "${ENV_FILE}"
chmod 600 "${ENV_FILE}"
unset ADMIN_TOKEN

cat > "/etc/systemd/system/${CONTROLLER_SERVICE}" <<EOF
[Unit]
Description=Mission Control approval-gated continuous delivery controller
After=network-online.target ${API_SERVICE}
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${APP_ROOT}
Environment=NODE_ENV=production
Environment=HOME=/root
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.local/bin:/root/.npm-global/bin:/root/.hermes/node/bin
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} ${APP_ROOT}/scripts/continuous-delivery-controller.mjs
Restart=on-failure
RestartSec=10
TimeoutStopSec=30
NoNewPrivileges=false
PrivateTmp=true
ProtectHome=read-only
ReadWritePaths=${APP_ROOT} /var/lib/ai-mission-control /run/lock /tmp -/root/.codex -/root/.config/gh

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${CONTROLLER_SERVICE}"
sleep 2
systemctl is-active --quiet "${CONTROLLER_SERVICE}"
systemctl status "${CONTROLLER_SERVICE}" --no-pager -n 20

echo "Continuous delivery controller installed and active."
echo "Service: ${CONTROLLER_SERVICE}"
echo "Environment file: ${ENV_FILE} (root-only)"
echo "No credential values were printed."
