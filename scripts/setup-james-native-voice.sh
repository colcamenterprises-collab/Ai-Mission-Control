#!/usr/bin/env bash
set -Eeuo pipefail

JAMES_BINARY="${JAMES_BINARY:-/usr/local/bin/james-hermes}"
JAMES_VENV="${JAMES_VENV:-/opt/hermes/.venv}"
VOICE_PORT="${HERMES_JAMES_VOICE_PORT:-9120}"
VOICE_PATH="${HERMES_JAMES_PROXY_BASE_PATH:-/hermes-james}"
VOICE_ENV_DIR="/etc/ai-mission-control"
VOICE_ENV="$VOICE_ENV_DIR/james-voice.env"
VOICE_SERVICE="/etc/systemd/system/james-hermes-voice.service"
MC_SERVICE="ai-mission-control-api.service"
MC_DROPIN_DIR="/etc/systemd/system/${MC_SERVICE}.d"
MC_DROPIN="$MC_DROPIN_DIR/james-native-voice.conf"
NGINX_SNIPPET="/etc/nginx/snippets/mission-control-james-native-voice.conf"

fail() { echo "STOP: $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run as root."
[[ -x "$JAMES_BINARY" ]] || fail "$JAMES_BINARY is not executable."
"$JAMES_BINARY" serve --help >/dev/null 2>&1 || fail "Installed james-hermes does not expose the required 'serve' backend. Upgrade/certify Hermes before continuing."
command -v nginx >/dev/null 2>&1 || fail "nginx is not installed."
command -v curl >/dev/null 2>&1 || fail "curl is not installed."

PYTHON="$JAMES_VENV/bin/python"
[[ -x "$PYTHON" ]] || fail "James Python runtime not found at $PYTHON."

HERMES_HOME_VALUE="${HERMES_HOME:-}"
if [[ -z "$HERMES_HOME_VALUE" ]]; then
  for candidate in /opt/hermes/.hermes /root/.hermes /opt/hermes; do
    if [[ -f "$candidate/config.yaml" ]]; then HERMES_HOME_VALUE="$candidate"; break; fi
  done
fi
[[ -n "$HERMES_HOME_VALUE" && -f "$HERMES_HOME_VALUE/config.yaml" ]] || fail "Could not locate the James Hermes config.yaml. Set HERMES_HOME explicitly and rerun."
CONFIG="$HERMES_HOME_VALUE/config.yaml"

echo "Hermes binary: $JAMES_BINARY"
echo "Hermes home:   $HERMES_HOME_VALUE"
echo "Voice port:    $VOICE_PORT"
echo "Proxy path:    $VOICE_PATH"

if ! "$PYTHON" - <<'PY' >/dev/null 2>&1
import faster_whisper
PY
then
  echo "Installing faster-whisper into James's existing virtual environment..."
  if command -v uv >/dev/null 2>&1; then uv pip install --python "$PYTHON" faster-whisper; else "$PYTHON" -m pip install faster-whisper; fi
fi

if ! "$PYTHON" - <<'PY' >/dev/null 2>&1
import edge_tts
PY
then
  echo "Installing free Edge TTS support into James's existing virtual environment..."
  if command -v uv >/dev/null 2>&1; then uv pip install --python "$PYTHON" edge-tts; else "$PYTHON" -m pip install edge-tts; fi
fi

BACKUP="${CONFIG}.before-native-voice.$(date +%Y%m%d%H%M%S)"
cp -a "$CONFIG" "$BACKUP"
echo "Config backup: $BACKUP"

HERMES_CONFIG="$CONFIG" "$PYTHON" - <<'PY'
import os
from pathlib import Path
import yaml
path = Path(os.environ["HERMES_CONFIG"])
data = yaml.safe_load(path.read_text()) or {}
stt = data.setdefault("stt", {})
stt["enabled"] = True
stt["provider"] = "local"
stt.setdefault("local", {})["model"] = stt.get("local", {}).get("model") or "base"
tts = data.setdefault("tts", {})
tts["provider"] = "edge"
path.write_text(yaml.safe_dump(data, sort_keys=False))
PY

install -d -m 700 "$VOICE_ENV_DIR"
TOKEN="$("$PYTHON" - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
)"
cat >"$VOICE_ENV" <<EOF
HERMES_HOME=$HERMES_HOME_VALUE
HERMES_DASHBOARD_SESSION_TOKEN=$TOKEN
HERMES_JAMES_SESSION_TOKEN=$TOKEN
HERMES_JAMES_VOICE_URL=http://127.0.0.1:$VOICE_PORT
EOF
chmod 600 "$VOICE_ENV"

cat >"$VOICE_SERVICE" <<EOF
[Unit]
Description=James Hermes native voice and conversation backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/hermes
EnvironmentFile=$VOICE_ENV
ExecStart=$JAMES_BINARY serve --host 127.0.0.1 --port $VOICE_PORT
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

install -d -m 755 "$MC_DROPIN_DIR"
cat >"$MC_DROPIN" <<EOF
[Service]
EnvironmentFile=$VOICE_ENV
EOF

cat >"$NGINX_SNIPPET" <<EOF
location = $VOICE_PATH/api/ws {
    proxy_pass http://127.0.0.1:$VOICE_PORT/api/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host 127.0.0.1:$VOICE_PORT;
    proxy_set_header Origin http://127.0.0.1:$VOICE_PORT;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}

location = $VOICE_PATH/api/audio/speak-stream {
    proxy_pass http://127.0.0.1:$VOICE_PORT/api/audio/speak-stream;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host 127.0.0.1:$VOICE_PORT;
    proxy_set_header Origin http://127.0.0.1:$VOICE_PORT;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}
EOF
chmod 644 "$NGINX_SNIPPET"

NGINX_SITE="$(grep -RIlE 'server_name[^;]*mission\.customli\.io' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -n 1 || true)"
[[ -n "$NGINX_SITE" ]] || fail "Could not locate the nginx server block for mission.customli.io. No nginx config was modified."

NGINX_SITE="$NGINX_SITE" NGINX_SNIPPET="$NGINX_SNIPPET" "$PYTHON" - <<'PY'
import os, re
from pathlib import Path
site = Path(os.environ["NGINX_SITE"])
snippet = os.environ["NGINX_SNIPPET"]
include = f"    include {snippet};"
text = site.read_text()
if include in text:
    raise SystemExit(0)
needle = "mission.customli.io"
pos = text.find(needle)
if pos < 0:
    raise SystemExit("mission.customli.io server_name not found")
# Find actual `server {` declarations, never the `server` substring in server_name.
blocks = list(re.finditer(r"(?m)^\s*server\s*\{", text[:pos]))
if not blocks:
    raise SystemExit("could not identify nginx server block")
brace = text.find("{", blocks[-1].start(), blocks[-1].end())
depth = 0
end = None
for i in range(brace, len(text)):
    if text[i] == "{": depth += 1
    elif text[i] == "}":
        depth -= 1
        if depth == 0:
            end = i
            break
if end is None or not (brace < pos < end):
    raise SystemExit("mission.customli.io was not inside the identified nginx server block")
site.write_text(text[:end] + include + "\n" + text[end:])
PY

systemctl daemon-reload
systemctl enable --now james-hermes-voice.service
sleep 3
systemctl is-active --quiet james-hermes-voice.service || { systemctl status james-hermes-voice.service --no-pager -l; fail "James native voice service failed."; }

curl -fsS -H "X-Hermes-Session-Token: $TOKEN" "http://127.0.0.1:$VOICE_PORT/api/status" >/dev/null || fail "Hermes native voice backend did not pass /api/status."
TICKET_JSON="$(curl -fsS -X POST -H "X-Hermes-Session-Token: $TOKEN" -H 'Content-Type: application/json' -d '{}' "http://127.0.0.1:$VOICE_PORT/api/auth/ws-ticket")" || fail "Installed Hermes does not support authenticated WebSocket ticket minting."
HERMES_TICKET_JSON="$TICKET_JSON" "$PYTHON" - <<'PY' >/dev/null || fail "Hermes ws-ticket response did not contain a valid single-use ticket."
import json, os
payload = json.loads(os.environ["HERMES_TICKET_JSON"])
ticket = payload.get("ticket")
assert isinstance(ticket, str) and len(ticket) >= 16
PY

echo "PASS: Hermes authenticated single-use WebSocket ticket minting is available."
nginx -t
systemctl reload nginx
systemctl restart "$MC_SERVICE"
sleep 3
systemctl is-active --quiet "$MC_SERVICE" || { systemctl status "$MC_SERVICE" --no-pager -l; fail "Mission Control API failed after attaching the Hermes voice bridge environment."; }
curl -fsS http://127.0.0.1:4100/api/healthz >/dev/null || fail "Mission Control health check failed after native voice setup."

echo "PASS: James native Hermes backend is running on 127.0.0.1:$VOICE_PORT"
echo "PASS: Mission Control API holds the Hermes master credential server-side"
echo "PASS: Public WebSockets accept only short-lived single-use Hermes tickets"
echo "PASS: STT provider configured: local (faster-whisper)"
echo "PASS: TTS provider configured: edge (free streaming TTS)"
echo "PASS: Browser SpeechRecognition/SpeechSynthesis are not part of this path."
