# Mission Control Continuous Delivery Runbook

## Purpose

Close the operational gap between an owner-approved GitHub pull request and a verified Hostinger production release without requiring Cameron to paste terminal commands.

The owner approves the outcome once. The approval is bound to an exact repository, PR number, PR head SHA, production environment, permitted actions, forbidden actions and bounded repair count.

## Lifecycle

```text
implementation -> PR -> CI green -> prepare delivery approval
-> owner approval -> controller claim -> revalidate exact PR + CI
-> merge -> deploy exact resulting main SHA -> certify
-> completed
```

If deployment/certification fails:

```text
failure -> automatic rollback to previous known-good SHA
-> bounded Codex repair in isolated worktree
-> protected-path check -> local deterministic checks
-> repair PR -> GitHub CI -> merge -> exact-SHA redeploy -> certify
```

If the approved boundary would be crossed, the execution fails/escalates instead of bypassing policy.

## Approval envelope

Production delivery is always risk level 3 and `OWNER_APPROVAL`. The envelope requires:

- repository
- `production` environment
- PR number
- exact 40-character approved PR head SHA
- `main` base branch
- explicit allowed operations
- explicit forbidden operations
- 0-3 bounded Codex repair attempts

A PR change after approval invalidates the approved head SHA. The controller refuses to merge it.

## Preparing a finalized PR

After the PR is non-draft and the required GitHub `validate` check has passed:

```bash
node scripts/prepare-production-delivery.mjs \
  --repo colcamenterprises-collab/Ai-Mission-Control \
  --pr <PR_NUMBER>
```

Optional:

```bash
--task-id <MISSION_CONTROL_TASK_ID>
--max-repairs 0|1|2|3
```

The helper reads the exact PR head from GitHub and creates the protected Mission Control approval request. It does not merge or deploy.

## Production controller

Service:

```text
mission-control-continuous-delivery.service
```

The controller polls approved Work Requests, atomically claims the approved execution and independently rechecks:

- owner approval exists and is completed
- risk level is 3+
- repository/environment match the approval envelope
- PR is still open, non-draft and same-repository
- PR head SHA is unchanged
- base branch is `main`
- required GitHub `validate` check is complete and successful
- any legacy combined GitHub status is successful

Only then can it merge.

## Deployment safety

`scripts/continuous-delivery-deploy.sh`:

- requires an exact 40-character merge SHA
- holds an exclusive production deployment lock
- refuses a dirty production checkout
- refuses non-`main` production checkout
- fetches and requires `origin/main` to equal the authorized target SHA
- delegates normal deployment to the existing conservative `deploy-mission-control.sh`
- verifies the resulting production checkout equals the authorized target SHA
- verifies local API, public API and public frontend
- automatically resets to and rebuilds/restarts the previous known-good SHA on failure

If `origin/main` has advanced beyond the approved merge SHA, deployment stops. It does not silently deploy additional unapproved code.

## Codex remediation boundary

Codex runs with workspace-only filesystem writes and no interactive escalation:

```text
--ask-for-approval never --sandbox workspace-write
```

It works only in an isolated Git worktree. It never receives authority to push, merge or deploy. The controller performs those actions after validation.

Automated repairs are rejected if they touch protected areas including:

- GitHub workflows
- deployment-control scripts
- database schema/migrations
- env/secrets/credentials
- nginx/systemd/infrastructure

The controller runs frozen/offline dependency validation, production typecheck, execution-policy tests, build and `git diff --check` before it pushes a repair branch. GitHub CI must then pass before the repair PR can merge.

## One-time production bootstrap

The controller is deliberately not installed merely by merging repository code. Installation changes the production execution control plane and therefore requires an explicit one-time root bootstrap on the Hostinger VPS:

```bash
cd /opt/apps/ai-mission-control
git pull --ff-only origin main
bash scripts/install-continuous-delivery-controller.sh
```

The installer refuses to enable the controller unless:

- Node, git, GitHub CLI, Codex CLI, pnpm, flock, systemd and curl exist
- root GitHub CLI authentication is valid
- Codex CLI is operational
- Mission Control admin authentication is available
- the production checkout contains the controller/deploy files

It writes only the Mission Control admin token to a root-only mode-0600 service environment file and does not print credential values. GitHub authentication remains in GitHub CLI's own credential store.

## Completion evidence

The Work Request can become `completed` only after the controller reports a successful certified production target. The result records:

- repository and PR
- approved head SHA
- GitHub merge SHA
- every deployment attempt
- whether rollback succeeded on failures
- repair PRs/files/merge SHAs, if used
- final deployed SHA
- certification result

A failed controller, failed CI, failed merge, failed deployment, failed rollback or exhausted repair budget cannot be reported as successful completion.
