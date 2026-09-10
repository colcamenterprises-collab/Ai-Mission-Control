import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("continuous delivery requires exact owner-approved production envelope", async () => {
  const route = await read("artifacts/api-server/src/routes/continuous-delivery.ts");
  const prepare = await read("artifacts/api-server/src/routes/continuous-delivery-prepare.ts");

  assert.match(route, /approvalDecision !== "OWNER_APPROVAL"/);
  assert.match(route, /request\.riskLevel < 3/);
  assert.match(route, /approval\.requiredAuthority !== "owner"/);
  assert.match(route, /approvedHeadSha/);
  assert.match(route, /repository !== request\.repository/);
  assert.match(route, /environment !== "production"/);
  assert.match(route, /maxRepairAttempts > 3/);

  assert.match(prepare, /riskLevel: 3/);
  assert.match(prepare, /approvalDecision: "OWNER_APPROVAL"/);
  assert.match(prepare, /requiredAuthority: "owner"/);
  assert.match(prepare, /rollbackPlan:/);
  assert.match(prepare, /requiredEvidence/);
});

test("production deploy wrapper is exact-SHA locked and rollback-first", async () => {
  const deploy = await read("scripts/continuous-delivery-deploy.sh");

  assert.match(deploy, /flock -n/);
  assert.match(deploy, /git status --porcelain/);
  assert.match(deploy, /git branch --show-current/);
  assert.match(deploy, /git rev-parse origin\/main/);
  assert.match(deploy, /REMOTE_MAIN.*EXPECTED_SHA/s);
  assert.match(deploy, /git reset --hard "\$\{PREVIOUS_SHA\}"/);
  assert.match(deploy, /ROLLBACK_SUCCEEDED=/);
  assert.match(deploy, /ROLLBACK_FAILED=/);
  assert.match(deploy, /ACTUAL_SHA.*EXPECTED_SHA/s);
  assert.match(deploy, /DEPLOYMENT_CERTIFIED_SHA=/);
});

test("controller enforces green CI and bounded sandboxed Codex repairs", async () => {
  const controller = await read("scripts/continuous-delivery-controller.mjs");

  assert.match(controller, /Required GitHub check/);
  assert.match(controller, /PR head changed after approval/);
  assert.match(controller, /Production delivery refuses fork-based PRs/);
  assert.match(controller, /--ask-for-approval", "never"/);
  assert.match(controller, /--sandbox", "workspace-write"/);
  assert.doesNotMatch(controller, /dangerously-bypass-approvals-and-sandbox|--yolo/);
  assert.match(controller, /PROTECTED_REPAIR_PATHS/);
  assert.match(controller, /package\\.json/);
  assert.match(controller, /pnpm-lock\\.yaml/);
  assert.match(controller, /pnpm-workspace\\.yaml/);
  assert.match(controller, /Repair crossed protected boundary/);
  assert.match(controller, /pnpm", \["typecheck:production"\]/);
  assert.match(controller, /pnpm", \["test:execution"\]/);
  assert.match(controller, /pnpm", \["build"\]/);
  assert.match(controller, /rollbackFailed/);
  assert.match(controller, /continuous-delivery\/report/);
});

test("controller installer keeps credentials root-only and runs outside API service", async () => {
  const installer = await read("scripts/install-continuous-delivery-controller.sh");

  assert.match(installer, /mission-control-continuous-delivery\.service/);
  assert.match(installer, /\/etc\/mission-control\/continuous-delivery\.env/);
  assert.match(installer, /chmod 600/);
  assert.match(installer, /gh auth status/);
  assert.match(installer, /gh auth setup-git/);
  assert.match(installer, /codex --version/);
  assert.match(installer, /Restart=on-failure/);
  assert.match(installer, /ExecStart=.*continuous-delivery-controller\.mjs/);
  assert.doesNotMatch(installer, /echo .*ADMIN_TOKEN|echo .*GITHUB_TOKEN/);
});
