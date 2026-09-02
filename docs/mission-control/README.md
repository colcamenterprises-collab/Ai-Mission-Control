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
| [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | Full platform architecture and control/data flows. |
| [ROUTES.md](ROUTES.md) | User-facing route map and API inventory. |
| [LEGACY_AND_DEPRECATION.md](LEGACY_AND_DEPRECATION.md) | Compatibility and removal register. |
| [AGENT_SYSTEM_OVERVIEW.md](AGENT_SYSTEM_OVERVIEW.md) | Generic Mission Control agent orientation. |
| [AGENT_EMPLOYMENT_PACK.md](AGENT_EMPLOYMENT_PACK.md) | Ground Zero employee operating standard. |
| [AMANDA_FINANCIAL_CONTROLLER.md](AMANDA_FINANCIAL_CONTROLLER.md) | Ground Zero Patch 1.2 Amanda role and certification. |
| [MODEL_POLICY_AND_OPENROUTER.md](MODEL_POLICY_AND_OPENROUTER.md) | Ground Zero Patch 1.3 model routing policy. |
| [JAMES_CONVERSATIONAL_VOICE.md](JAMES_CONVERSATIONAL_VOICE.md) | Ground Zero Patch 1.5 live conversation surface for James. |
| [GROUND_ZERO_OPERATING_MODEL.md](GROUND_ZERO_OPERATING_MODEL.md) | Ground Zero autonomy and anti-stall contract. |
| [SWOT_AND_RISK.md](SWOT_AND_RISK.md) | Architectural risk priorities. |
| [CHANGE_CONTROL.md](CHANGE_CONTROL.md) | Documentation and CI change-control rules. |

## Knowledge integration

Files below `docs/` are imported by the Memory sync service as protected repository-backed Knowledge records. Git remains canonical and Knowledge is the indexed runtime view.

`Git repository docs → Memory Sync → Knowledge records → agents`

## Classification legend

- **CURRENT** — canonical production path or component.
- **TRANSITIONAL** — compatibility path with a removal condition.
- **LEGACY** — retained for old links/data/clients.
- **DEAD/SHADOWED** — superseded implementation pending safe removal.
- **UNKNOWN / VERIFY HOST** — repository evidence is insufficient; host state must be inspected.

## Operating rule

Any pull request that changes routes, execution states, data ownership, agent/runtimes, authentication boundaries, Knowledge/Memory behavior, deployment topology, or a compatibility path must update this documentation in the same pull request. CI performs structural route checks; semantic architecture review remains a human release responsibility.
