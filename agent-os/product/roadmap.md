# Mission Control Roadmap

## Stage 1 — Real worker runtime

Status: in progress.

- James Hermes connected through the internal `/api/james/message` route.
- OpenRouter, OpenAI, Claude, and webhook runtimes are available as worker provider options.
- Test connection and test work actions exist.
- Activity records are created for runtime results.

## Stage 2 — Playbook layer

Goal: make Mission Control's markdown standards, product docs, and specs visible and usable by AI workers.

- Add Agent OS folders for product, standards, specs, and verification.
- Surface these documents in Playbooks and Knowledge.
- Attach relevant playbooks to routed work.
- Record which playbooks were used in the work report.

## Stage 3 — Tool and secrets execution

Goal: workers can safely use only the tools assigned to them.

- Improve tool vault assignment UX.
- Log each tool access.
- Add owner approval gates for risky actions.
- Add revoke/rotate controls.

## Stage 4 — Reports and approvals

Goal: every completed job produces an owner-readable report.

- Work requested.
- Worker used.
- Context/playbooks used.
- Tools used.
- Output.
- Files or systems changed.
- Blockers.
- Next action.
- Owner approval required.

## Stage 5 — SaaS readiness

Goal: prepare for external customers.

- Workspaces/tenant separation.
- Billing.
- Customer onboarding.
- Provider key management.
- Support and audit exports.
