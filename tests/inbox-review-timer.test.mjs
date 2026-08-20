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
    /--on-calendar='\*-\*-\* 07:00:00 Asia\/Bangkok'/,
    "timer must be timezone-bound to 07:00 Asia/Bangkok rather than inheriting the VPS timezone",
  );
});

test("Inbox review timer remains persistent", () => {
  assert.match(installer, /--timer-property=Persistent=true/);
});
