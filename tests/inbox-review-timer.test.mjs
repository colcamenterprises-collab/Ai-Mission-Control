import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const installer = readFileSync(
  new URL("../scripts/install-inbox-review-timer.sh", import.meta.url),
  "utf8",
);

test("Inbox review timer is explicitly scheduled for 07:00 Asia/Bangkok", () => {
  assert.match(
    installer,
    /OnCalendar=\*-\*-\* 07:00:00 Asia\/Bangkok/,
    "timer must be timezone-bound to 07:00 Asia/Bangkok rather than inheriting the VPS timezone",
  );
});

test("Inbox review timer remains persistent", () => {
  assert.match(installer, /Persistent=true/);
  assert.match(installer, /systemctl enable --now/);
});

test("Inbox review timer installer is idempotent and removes legacy transient units", () => {
  assert.match(installer, /systemctl stop "\$TIMER_NAME"/);
  assert.match(installer, /systemctl stop "\$SERVICE_NAME"/);
  assert.match(installer, /\/run\/systemd\/transient\/\$\{TIMER_NAME\}/);
  assert.match(installer, /\/run\/systemd\/transient\/\$\{SERVICE_NAME\}/);
  assert.match(installer, /systemctl daemon-reload/);
  assert.doesNotMatch(installer, /systemd-run --unit=mission-control-inbox-review/);
});
