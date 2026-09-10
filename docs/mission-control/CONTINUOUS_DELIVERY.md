# Continuous Delivery Control Plane

**Status:** CURRENT  
**Reviewed:** 2026-09-10

Mission Control uses a dedicated owner-approved Work Request to bridge a finalized GitHub PR into production delivery. Production delivery remains behind global admin authentication and a second controller-side owner-approval validation.

## API routes

`POST /api/continuous-delivery/prepare` — creates a risk-level-3 `OWNER_APPROVAL` Work Request bound to an exact repository, PR number and PR head SHA. The request includes the permitted operations, forbidden operations, rollback plan and bounded Codex repair count. It does not merge or deploy.

`POST /api/continuous-delivery/claim/:id` — controller-only claim path after approval. It refuses any request that is not currently `approved`, does not have completed owner approval, does not target production, has an invalid/mismatched repository or SHA, or has a malformed permission envelope. A successful claim advances the Work Request through dispatched/acknowledged/running.

`POST /api/continuous-delivery/report/:id` — controller completion path. It accepts only a currently running delivery and redacts structured evidence before persistence. `success` transitions to completed only after controller certification; `failure` transitions to failed.

## Operational components

- `scripts/prepare-production-delivery.mjs` validates a finalized same-repository PR and required GitHub `validate` CI result, then creates the exact-SHA approval request.
- `scripts/continuous-delivery-controller.mjs` revalidates the approved PR and CI immediately before merge, merges using the approved head SHA, launches exact-SHA delivery, and reports completion evidence.
- `scripts/continuous-delivery-deploy.sh` serializes production releases, refuses dirty/non-main checkouts, requires the authorized SHA to equal fetched `origin/main`, runs the conservative Mission Control deploy, certifies the resulting SHA and production health, and restores the previous known-good SHA on failure.
- `scripts/install-continuous-delivery-controller.sh` performs the one-time root/systemd bootstrap after verifying GitHub CLI, Codex CLI and Mission Control authentication.

## Bounded remediation

After a failed deployment has rolled back, the controller may use Codex only within the owner-approved repair count. Codex writes only to an isolated Git worktree under `workspace-write` sandboxing with approval escalation disabled. It cannot push, merge or deploy. The controller rejects protected-path changes, runs deterministic local validation, creates the repair PR and requires GitHub CI to pass before merge and redeployment.

Any repair requiring workflow/deployment-control edits, schema/migrations, credentials/secrets, nginx/systemd/infrastructure, DNS/firewall, another repository or a production hot patch is outside the envelope and requires a new protected approval rather than autonomous continuation.
