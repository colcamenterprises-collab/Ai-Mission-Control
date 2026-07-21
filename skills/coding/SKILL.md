---
name: coding
title: Safe Build and Code Work
category: engineering
description: Guides a connected build agent through scoped implementation, checks, deploy notes, and owner-safe reporting.
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

## Before changing code

Confirm:

- Goal
- Repository or system
- Branch or environment
- Access available
- Risk level
- Test/deploy command
- Rollback notes if relevant

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
