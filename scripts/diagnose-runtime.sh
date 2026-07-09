#!/usr/bin/env bash
set -u

# Mission Control runtime diagnostics.
# This script is intentionally read-only:
# - no git pull
# - no install
# - no build
# - no database writes
# - no service restart
# - no secret printing

SERVICE_NAME="${MISSION_CONTROL_SERVICE_NAME:-ai-mission-control-api.service}"
REPO_DIR="${MISSION_CONTROL_REPO_DIR:-/opt/apps/ai-mission-control}"
PUBLIC_ORIGIN="${MISSION_CONTROL_PUBLIC_ORIGIN:-https://mission.customli.io}"
HEALTH_PORTS="${MISSION_CONTROL_DIAG_PORTS:-4100 3000 4000 5000 5173 8080 8787 9000}"

section() {
  printf '\n\033[1;36m== %s ==\033[0m\n' "$1"
}

run() {
  printf '\n$ %s\n' "$*"
  "$@" 2>&1 || true
}

redact_line() {
  # Keep this deliberately simple and shell-safe. It redacts common KEY=value
  # secrets without trying to parse every possible JSON/YAML shape.
  sed -E \
    -e 's#(DATABASE_URL=)[^[:space:]]+#\1[REDACTED]#g' \
    -e 's#(MISSION_CONTROL_ADMIN_TOKEN=)[^[:space:]]+#\1[REDACTED]#g' \
    -e 's#(VITE_MISSION_CONTROL_ADMIN_TOKEN=)[^[:space:]]+#\1[REDACTED]#g' \
    -e 's#(SESSION_SECRET=)[^[:space:]]+#\1[REDACTED]#g' \
    -e 's#(GITHUB_TOKEN=)[^[:space:]]+#\1[REDACTED]#g' \
    -e 's#(OPENAI_API_KEY=)[^[:space:]]+#\1[REDACTED]#g' \
    -e 's#(ANTHROPIC_API_KEY=)[^[:space:]]+#\1[REDACTED]#g' \
    -e 's#([A-Za-z0-9_]*(TOKEN|SECRET|PASSWORD|API_KEY)[A-Za-z0-9_]*=)[^[:space:]]+#\1[REDACTED]#g'
}

print_env_presence() {
  local name="$1"
  if printenv "$name" >/dev/null 2>&1; then
    echo "$name=SET"
  else
    echo "$name=missing"
  fi
}

section "Mission Control runtime diagnostics"
echo "Generated at: $(date -Is 2>/dev/null || date)"
echo "Host: $(hostname 2>/dev/null || echo unknown)"
echo "User: $(id -un 2>/dev/null || echo unknown)"
echo "Repo dir: $REPO_DIR"
echo "Service: $SERVICE_NAME"
echo "Public origin: $PUBLIC_ORIGIN"
echo "Health ports: $HEALTH_PORTS"

section "Repository state"
if [ -d "$REPO_DIR/.git" ]; then
  cd "$REPO_DIR" || exit 0
  run pwd
  run git status -sb
  run git log --oneline --decorate -n 8
  run git remote -v
else
  echo "Repo not found at $REPO_DIR"
fi

section "Runtime versions"
run node --version
run npm --version
run pnpm --version
run git --version

section "Workspace files"
if [ -d "$REPO_DIR" ]; then
  cd "$REPO_DIR" || exit 0
  run ls -la
  run test -f package.json
  run test -f pnpm-workspace.yaml
  run test -d artifacts/api-server
  run test -d artifacts/mission-control
  run test -d lib/db
fi

section "Package scripts"
if [ -f "$REPO_DIR/package.json" ]; then
  cd "$REPO_DIR" || exit 0
  node -e 'const p=require("./package.json"); console.log(JSON.stringify(p.scripts||{}, null, 2));' 2>&1 || true
fi

section "Systemd service configuration"
if command -v systemctl >/dev/null 2>&1; then
  run systemctl status "$SERVICE_NAME" --no-pager
  echo "\n$ systemctl cat $SERVICE_NAME"
  systemctl cat "$SERVICE_NAME" --no-pager 2>&1 | redact_line || true
  echo "\n$ systemctl show selected properties"
  systemctl show "$SERVICE_NAME" \
    --property=Id,LoadState,ActiveState,SubState,UnitFileState,ExecStart,WorkingDirectory,EnvironmentFiles,FragmentPath,DropInPaths,User,Group,Restart,RestartUSec,Environment \
    --no-pager 2>&1 | redact_line || true
else
  echo "systemctl not available"
fi

section "Recent service logs"
if command -v journalctl >/dev/null 2>&1; then
  journalctl -u "$SERVICE_NAME" -n 120 --no-pager 2>&1 | redact_line || true
else
  echo "journalctl not available"
fi

section "Environment presence in current shell"
print_env_presence PORT
print_env_presence DATABASE_URL
print_env_presence NODE_ENV
print_env_presence MISSION_CONTROL_ADMIN_TOKEN
print_env_presence VITE_MISSION_CONTROL_ADMIN_TOKEN
print_env_presence MISSION_CONTROL_ALLOWED_ORIGINS
print_env_presence MISSION_CONTROL_SKILLS_DIR
print_env_presence MISSION_CONTROL_SKILLS_CACHE_DIR
print_env_presence GITHUB_TOKEN

section "Environment file paths from systemd"
if command -v systemctl >/dev/null 2>&1; then
  systemctl show "$SERVICE_NAME" --property=EnvironmentFiles --no-pager 2>/dev/null | redact_line || true
fi

section "Port/process diagnostics"
run ss -ltnp
run pgrep -af "node|dist/index.mjs|dist/index.js|ai-mission-control|mission-control"

section "Local health checks"
PORT_VALUE="${PORT:-}"
if [ -z "$PORT_VALUE" ] && command -v systemctl >/dev/null 2>&1; then
  PORT_VALUE="$(systemctl show "$SERVICE_NAME" --property=Environment --no-pager 2>/dev/null | tr ' ' '\n' | sed -n 's/^PORT=//p' | tail -1)"
fi

if [ -n "$PORT_VALUE" ]; then
  echo "Detected PORT=$PORT_VALUE from environment/systemd"
  run curl -fsS "http://127.0.0.1:${PORT_VALUE}/api/healthz"
else
  echo "PORT not detected from environment/systemd. Trying known candidate ports."
fi

for port in $HEALTH_PORTS; do
  echo "--- health candidate port $port"
  curl -fsS "http://127.0.0.1:${port}/api/healthz" 2>/dev/null || true
  echo
 done

if [ -n "${MISSION_CONTROL_ADMIN_TOKEN:-}" ] && [ -n "$PORT_VALUE" ]; then
  run curl -fsS -H "Authorization: Bearer ${MISSION_CONTROL_ADMIN_TOKEN}" "http://127.0.0.1:${PORT_VALUE}/api/skills"
else
  echo "Skipping authenticated local /api/skills check: token or detected port not available in current shell."
fi

section "Public route checks"
run curl -I -L --max-time 15 "$PUBLIC_ORIGIN/api/healthz"
run curl -fsS -L --max-time 15 "$PUBLIC_ORIGIN/api/healthz"
run curl -I -L --max-time 15 "$PUBLIC_ORIGIN/"

section "Nginx route diagnostics"
if command -v nginx >/dev/null 2>&1; then
  run nginx -t
  echo "\n$ nginx mission/customli compact route summary"
  nginx -T 2>/dev/null | grep -nE "mission|customli|ai-mission|localhost|127\.0\.0\.1:4100|proxy_pass|server_name|root /opt/apps/ai-mission-control" | head -160 | redact_line || true
else
  echo "nginx not available"
fi

section "Skills filesystem diagnostics"
if [ -d "$REPO_DIR" ]; then
  cd "$REPO_DIR" || exit 0
  run find skills -maxdepth 3 -type f \( -name 'SKILL.md' -o -name 'metadata.json' -o -name '.skill-source-status.json' \) -print
  if [ -f skills/.skill-source-status.json ]; then
    echo "\n$ skills/.skill-source-status.json redacted preview"
    sed -n '1,220p' skills/.skill-source-status.json | redact_line || true
  fi
fi

section "Database safety note"
echo "This script does not connect to PostgreSQL and does not run drizzle commands."
echo "Schema diagnostics should be added separately as a read-only patch."

section "Summary"
echo "Diagnostics complete. Review the output for:"
echo "- service WorkingDirectory / ExecStart"
echo "- EnvironmentFiles path"
echo "- detected PORT or candidate port 4100 health result"
echo "- nginx ownership of frontend/API routes"
echo "- git branch status and local commits"
echo "- public and local health check result"
