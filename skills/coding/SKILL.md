---
name: coding
title: Safe Build and Code Work
category: engineering
description: Guides a connected build agent through scoped implementation, checks, production-delivery handoff, and owner-safe reporting.
---

# Safe Build and Code Work

Use this skill when an AI worker receives implementation, debugging, repo, deployment, or technical review work.

## Operating rules

1. Work only inside the assigned repository or system.
2. Make scoped, additive changes unless explicitly instructed otherwise.
3. Do not change canonical data, secrets, billing, auth, or production infrastructure without explicit approval.
4. Do not fake test results, deploy results, or screenshots.
5. Keep all changes auditable.
6. Report exact files changed and exact checks run.
7. Never hot-patch the production checkout to bypass GitHub or CI.

## Before changing code

Confirm:

- Goal
- Repository or system
- Branch or environment
- Access available
- Risk level
- Test/deploy command
- Rollback notes if relevant

## Production delivery handoff

For Mission Control changes intended for production:

1. Finish implementation in a branch/worktree and open the PR.
2. Resolve review findings and wait for the required GitHub `validate` CI check to pass.
3. Do not merge the PR manually as an agent.
4. Prepare the exact PR head for owner approval with:

   `node scripts/prepare-production-delivery.mjs --repo colcamenterprises-collab/Ai-Mission-Control --pr <PR_NUMBER>`

5. The preparation step binds owner approval to the repository, PR number and exact head SHA. If the PR changes after preparation, the approval is invalid for the new head and a fresh approval package is required.
6. After owner approval, the continuous-delivery controller owns merge, exact-SHA production deployment, health certification, rollback and bounded code-only Codex remediation.
7. A GitHub merge, successful command, worker result, or service restart is not completion. Production is complete only when the Work Request reaches `completed` with certified local API, public API and frontend evidence.
8. If remediation needs protected infrastructure, credentials, secrets, database schema/migrations, GitHub workflows, deployment-control scripts, DNS, firewall, nginx, another repository, or a production hot-patch, stop at the approval boundary and escalate rather than bypassing it.

## Output format

Return:

- Summary of work completed
- Files changed
- Tests/checks run
- Risks or unknowns
- Next safe action

## Blockers

Stop and report if:

- Credentials are missing
- Repo/environment cannot be reached
- Tests are unavailable
- The requested change may delete data
- The work requires owner approval
