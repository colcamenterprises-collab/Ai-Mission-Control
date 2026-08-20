#!/usr/bin/env bash
set -Eeuo pipefail
# Installs one persistent daily timer using the same systemd detached-job
# infrastructure as James task execution. Safe to rerun: the stable unit name
# is replaced rather than duplicated.
#
# IMPORTANT: the schedule is explicitly anchored to Asia/Bangkok so the
# intended 07:00 Thailand review time is independent of the VPS timezone.
systemctl stop mission-control-inbox-review.timer 2>/dev/null || true
systemctl reset-failed mission-control-inbox-review.timer 2>/dev/null || true
systemd-run --unit=mission-control-inbox-review --on-calendar='*-*-* 07:00:00 Asia/Bangkok' --timer-property=Persistent=true \
  /opt/apps/ai-mission-control/scripts/trigger-inbox-review.sh
