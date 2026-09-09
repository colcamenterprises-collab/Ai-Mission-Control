# Agentic OS Production Certification

Mission Control 1.6 uses a production certification in addition to CI. CI proves the repository builds and its deterministic tests pass; this certification proves the deployed control plane, live employee context, execution contracts, evidence gates, James supervision, failure replay and approval boundaries operate together.

## One-command run

From the production checkout:

```bash
cd /opt/apps/ai-mission-control
bash ./scripts/certify-agentic-os-1.6.sh
```

The command exits `0` only when every required check passes. Any failed check exits non-zero and is an operational blocker until corrected and rerun.

## What the certification does

1. Verifies the local production API health endpoint.
2. Removes all active and archived Tasks that existed before certification. These are treated as obsolete operational work for the clean-baseline run. Work Request/execution/audit history is intentionally retained as evidence.
3. Calls Ground Zero preparation to re-apply approved Employment Packs, canonical runtime context and model policy, and to recreate only the currently required canonical recurring work such as the AI Intelligence Analyst daily Task when applicable.
4. Requires Ground Zero readiness to show current employees have configured runtimes and assembled canonical context.
5. Runs live role-awareness probes for James, Amanda, Justin and AI Intelligence Analyst. This proves the role instructions reached the actual runtime rather than only existing in repository files.
6. Runs the deterministic live Agentic Harness probe. It creates a temporary self-cleaning Work Request, submits an unsupported completion, verifies it is rejected and recorded in failure replay, then submits a correctly evidenced James-verified result and verifies completion. It also checks protected production capability classification.
7. Runs a real safe James Task end to end and requires the Work Request contract, evidence-gated evals, James verification and completed execution state.
8. Runs a real delegated Amanda Task and requires the same completion guarantees with James supervisory verification.
9. Creates a simulated protected production-deploy Task and proves it remains `awaiting_approval` with `production_change` classified as protected. The certification never grants that approval and never performs a deployment through this test.
10. Removes its own certification Tasks and writes durable JSON/log evidence to `/var/lib/ai-mission-control/certifications`.

## Agent education and role awareness

The Agentic Harness is the universal execution discipline; it is not the complete role definition for an employee. Current and future employees require all of the following:

- root `AGENTS.md` for company-wide execution, evidence, authority and certification rules;
- the employee Employment Pack for role, responsibilities, success criteria and boundaries;
- canonical company context and relevant shared Knowledge;
- only the skills/playbooks relevant to the assigned Task;
- execution-scoped capabilities and approval state from the Work Request contract.

Ground Zero `prepare` writes the approved Employment Pack/context projection into managed employee workspaces. Ground Zero `live-probe` then asks the actual configured runtime to state its current operating boundary. A successful certification therefore proves current configured employees received and can use the required role context; it does not merely assume awareness.

Future employees must be provisioned through the same Employment Pack/context model and must pass the relevant live probe/certification before broader autonomy is granted.

## API route

`POST /api/agentic-os/certification/probe` — admin-authenticated, temporary, self-cleaning live probe of the Agentic Harness. It proves an unsupported completion remains non-terminal, failed eval evidence is retained for replay, a corrected evidenced result can complete, and a production deployment is classified as a protected capability. It does not deploy, spend money, send external messages, or retain its temporary Task.

Related routes:

- `GET /api/ground-zero/certification`
- `POST /api/ground-zero/prepare`
- `POST /api/ground-zero/live-probe`
- `GET /api/executions`
- `GET /api/tasks`
- `DELETE /api/tasks/:id`

## Pass criteria

A production certification is PASS only when:

- production health is OK;
- obsolete active and archived Task boards are cleared;
- current employee runtime/context readiness has no Ground Zero gaps;
- all live role-awareness probes pass;
- bad completion is rejected and failure replay is retained;
- corrected completion passes deterministic evals;
- James end-to-end execution completes under the harness;
- delegated specialist execution completes under the harness and James QA;
- protected production work is blocked at approval;
- no certification Task remains afterward;
- the durable report records zero failed checks.

Do not downgrade or waive a failed certification check to obtain a green result. Correct the failing layer and rerun the certification.
