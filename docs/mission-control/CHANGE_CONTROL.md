# Mission Control V1.0 — Documentation Change Control

**Status:** CURRENT  
**Effective:** 2026-09-01

## Objective

Mission Control architecture documentation must evolve with the code. Documentation cannot rely on someone remembering to perform a separate cleanup weeks after a release.

## Canonical-source rule

The canonical working copy is `docs/mission-control/` in Git.

Mission Control Knowledge receives these files through the existing repository-document Memory Sync. Do not manually create a second copy of these documents in Knowledge.

## Same-PR update rule

A pull request must update the relevant V1 documentation when it changes any of the following:

- frontend routes, redirects or route ownership;
- API methods/paths or router mount order;
- authentication/authorization boundaries;
- Task workflow states or completion/QA behavior;
- execution/work-request state machine or approval policy;
- agent/runtime/provisioning architecture;
- Knowledge, Memory, Obsidian or Playbook sources;
- core database ownership/state boundaries;
- production deployment/readiness architecture;
- compatibility/legacy paths or their removal conditions.

The change is incomplete until code and documentation agree.

## Automated enforcement

`scripts/check-mission-control-docs.mjs` performs structural checks in CI. It verifies:

1. the canonical document set exists;
2. every literal frontend route declared in `App.tsx` is present in `ROUTES.md`;
3. every literal Express route pattern discovered in `artifacts/api-server/src/routes/*.ts` is represented in `ROUTES.md`;
4. public avatar/static compatibility paths are documented;
5. known compatibility routers are recorded in the legacy register.

This is deliberately a **coverage** check, not a claim that regex can understand architecture semantics.

## Human semantic review

CI cannot determine whether a route’s purpose, security implications or state ownership changed. Therefore every major Mission Control release must manually review at minimum:

- `SYSTEM_ARCHITECTURE.md`
- `ROUTES.md`
- `LEGACY_AND_DEPRECATION.md`
- `AGENT_SYSTEM_OVERVIEW.md`
- `SWOT_AND_RISK.md`

Update the reviewed date/baseline in the canonical index.

## Agent overview review cadence

The generic `AGENT_SYSTEM_OVERVIEW.md` is intentionally stable and provider-agnostic. Do **not** rewrite it for every new employee. Review/update it when a major release changes how all workers are expected to operate.

## Legacy removal rule

Before deleting a compatibility path:

1. identify its current consumer or persisted-data reason;
2. meet the removal condition in `LEGACY_AND_DEPRECATION.md`;
3. migrate consumers/data first;
4. remove the compatibility implementation and documentation classification in the same PR;
5. add or retain regression tests proving canonical behavior.

## Stale-document rule

Historical documents may remain only when clearly labelled historical and unable to compete with the canonical architecture source. A stale document under `docs/` is especially dangerous because Memory Sync makes it searchable by agents.

When a top-level historical architecture document is superseded, either:

- replace it with a short pointer to `docs/mission-control/README.md`, or
- delete it after inbound references are checked.

## Release checklist

For a major release:

- [ ] Code routes match `ROUTES.md`.
- [ ] Compatibility register reflects current shims/aliases.
- [ ] Task/execution/QA states in architecture docs match code.
- [ ] Agent overview matches worker policy.
- [ ] Knowledge/Memory source behavior matches code.
- [ ] Provisioning/runtime boundaries match code.
- [ ] SWOT risks closed/added/reprioritized as necessary.
- [ ] CI documentation check passes.
- [ ] Knowledge sync is run/verified after deployment.

## Blocker rule

If a documentation assertion depends on host state not represented in Git (systemd, nginx, cron, filesystem backup, runtime installation), classify it `UNKNOWN / VERIFY HOST`. Do not invent the answer and do not delete dependent compatibility code until the host is inspected.
