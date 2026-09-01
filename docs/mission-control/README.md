# Mission Control V1.0 — canonical system documentation

**Status:** CURRENT  
**Release baseline:** V1.0  
**Repository source of truth:** `main`  
**Initial architecture review:** 2026-09-01  
**Baseline main SHA reviewed:** `b55101db34a4fa2502dd70cf1a8cd3fd0b5b0683`

This directory is the canonical living documentation for Mission Control. It describes the platform as implemented in the repository, not an aspirational product diagram.

Mission Control is the **agent-agnostic operating and orchestration system**. Individual workers such as James Hermes, OpenClaw employees, Codex, and future runtimes are replaceable workers/adapters. They are not Mission Control itself.

## Canonical document set

| Document | Purpose |
|---|---|
| [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | Full platform architecture, component map, control/data flows, storage, security, execution, knowledge and deployment boundaries. |
| [ROUTES.md](ROUTES.md) | Complete user-facing route map and API route/module inventory, including aliases and compatibility paths. |
| [LEGACY_AND_DEPRECATION.md](LEGACY_AND_DEPRECATION.md) | Current, transitional, legacy, shadowed/dead and investigation register with removal conditions. |
| [AGENT_SYSTEM_OVERVIEW.md](AGENT_SYSTEM_OVERVIEW.md) | Generic orientation document every current or future Mission Control agent should read. Reviewed manually at major releases. |
| [AGENT_EMPLOYMENT_PACK.md](AGENT_EMPLOYMENT_PACK.md) | Ground Zero employee operating standard: role, responsibilities, delegations, systems, skills, communication, escalation, success and boundaries. |
| [AMANDA_FINANCIAL_CONTROLLER.md](AMANDA_FINANCIAL_CONTROLLER.md) | Ground Zero Patch 1.2 role, SBB controls, access truth rules and operational certification for Amanda. |
| [GROUND_ZERO_OPERATING_MODEL.md](GROUND_ZERO_OPERATING_MODEL.md) | Ground Zero autonomy rule, James standing management responsibility, anti-stall supervision and owner-escalation contract. |
| [SWOT_AND_RISK.md](SWOT_AND_RISK.md) | SWOT analysis, architectural risks and remediation priorities. |
| [CHANGE_CONTROL.md](CHANGE_CONTROL.md) | Rules that keep these documents current and CI enforcement requirements. |

## Knowledge integration

These files do **not** require a second manually maintained copy in Mission Control Knowledge.

`artifacts/api-server/src/services/memory-sync.ts` imports every Markdown file below `docs/` into the Memory/Knowledge store with the `repo-docs:` source prefix and `knowledge` category. Synced source documents are versioned in the database and protected from editing/deletion in the Knowledge UI; changes must be made in Git and then re-synced.

Therefore:

`Git repository docs → Memory Sync → Knowledge records → agents`

The repository remains canonical. Knowledge is the indexed runtime view.

## Classification legend

- **CURRENT** — canonical production path or component.
- **TRANSITIONAL** — required compatibility path that has an explicit removal condition.
- **LEGACY** — retained for old links/data/clients but not the canonical path.
- **DEAD/SHADOWED** — unreachable or superseded implementation that should be removed when verified safe.
- **UNKNOWN / VERIFY HOST** — repository evidence is insufficient; production host state must be inspected before changing it.

## Operating rule

Any pull request that changes routes, execution states, data ownership, agent/runtimes, authentication boundaries, Knowledge/Memory behavior, deployment topology, or a compatibility path must update this documentation in the same pull request. CI performs structural route checks; semantic architecture review remains a human release responsibility.
