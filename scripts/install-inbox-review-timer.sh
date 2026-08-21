#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="mission-control-inbox-review.service"
TIMER_NAME="mission-control-inbox-review.timer"
SERVICE_UNIT="/etc/systemd/system/${SERVICE_NAME}"
TIMER_UNIT="/etc/systemd/system/${TIMER_NAME}"
APP_ROOT="/opt/apps/ai-mission-control"

# Migrate safely from the earlier transient systemd-run implementation.
systemctl stop "$TIMER_NAME" 2>/dev/null || true
systemctl stop "$SERVICE_NAME" 2>/dev/null || true
systemctl disable "$TIMER_NAME" 2>/dev/null || true
systemctl reset-failed "$TIMER_NAME" "$SERVICE_NAME" 2>/dev/null || true

# Remove only the known transient fragments created by our former installer.
rm -f \
  "/run/systemd/transient/${TIMER_NAME}" \
  "/run/systemd/transient/${SERVICE_NAME}"

cat >"$SERVICE_UNIT" <<EOF
[Unit]
Description=Mission Control daily Inbox review
After=network-online.target ai-mission-control-api.service
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${APP_ROOT}
ExecStart=${APP_ROOT}/scripts/trigger-inbox-review.sh
EOF

cat >"$TIMER_UNIT" <<'EOF'
[Unit]
Description=Mission Control daily Inbox review timer

[Timer]
OnCalendar=*-*-* 07:00:00 Asia/Bangkok
Persistent=true
Unit=mission-control-inbox-review.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now "$TIMER_NAME"

systemctl is-enabled --quiet "$TIMER_NAME"
systemctl is-active --quiet "$TIMER_NAME"

echo "Installed ${TIMER_NAME} at 07:00 Asia/Bangkok (persistent, idempotent)."
