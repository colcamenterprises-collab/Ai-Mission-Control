# Shared Skills + Capability Routing

## Purpose

Mission Control uses one execution lifecycle while allowing Hermes and other agents to benefit from a shared, human-readable Obsidian skill library.

## Source model

- Existing repository skills remain discoverable through the current Skills service.
- One or more Obsidian `Skills` directories are configured with `MISSION_CONTROL_SHARED_SKILLS_DIRS`.
- Shared vault skills are read directly; they are not copied into a second Mission Control-owned mirror.
- A shared skill must use `status: approved` before it is eligible for automatic routing.
- Missing or unrecognised status is treated as `needs-review` (fail closed).

Recommended vault layout:

```text
Skills/
  Hermes Built-In/
  Customli/
  SBB/
  Clients/
```

Each skill remains a standard `SKILL.md` file. Suggested frontmatter:

```yaml
---
name: hostinger-production-deployment
title: Hostinger Production Deployment
category: Customli
status: needs-review
enabled: true
description: Safely deploy a validated application release to Hostinger.
---
```

## Governance

Mission Control exposes the following states for vault skills:

- `proposed`
- `needs-review`
- `approved`
- `deprecated`

Only `approved` skills are routable. Owner/admin actions in the Skills UI update the status in the vault file itself, preserving the vault as the shared source of truth.

## Execution routing

The route order is intentionally:

```text
POST /api/executions
  -> capability-routing middleware
  -> existing executions router
  -> existing policy / approval / permissions / lifecycle
```

The middleware does not create a second execution engine. It enriches an otherwise-unassigned request with:

- selected agent ID
- routing reason
- selected skill metadata
- routed agent name

The existing execution route continues to own creation, approval policy, permission enforcement, transitions and execution state.

## Agent selection

Automatic selection requires `requirements.capabilities`. Mission Control:

1. Finds plugged-in agents.
2. Validates the full requirement set with the existing permission eligibility service.
3. Prefers exact capability grants over wildcard grants.
4. Uses lead status, success rate and completed-task count only as deterministic tie-breakers.
5. Leaves the request unassigned if no eligible agent exists.

This is fail-closed: Mission Control does not guess a worker when capabilities are absent.

## Skill selection

Skills are ranked against the requested action and required capabilities using their name, title, description, category and path. Vault skills are excluded unless approved.

Selected skills are stored in two places for different purposes:

- `requirements.selectedSkills` keeps the routing snapshot alongside the work request.
- `execution_instructions` is the canonical instruction-use record containing the stable skill ID, type, version, provenance and selection reason.

The work request and its selected instructions are created in one database transaction. If instruction persistence fails, the work request creation fails with it rather than leaving an execution without its routed-skill provenance.

`GET /executions/:id` is read-only and returns the canonical instruction rows with the execution detail. It never inserts or mutates instructions.

## Production configuration

Example:

```bash
MISSION_CONTROL_OBSIDIAN_VAULT=/opt/mission-control-vault
MISSION_CONTROL_SHARED_SKILLS_DIRS=/opt/mission-control-vault/Skills
```

Multiple shared roots can be comma-separated if a future deployment separates business or client vaults.

## Safety rules

- Vault IDs resolve only inside configured roots; path traversal is rejected.
- Skill files larger than 256 KB are rejected.
- Dot directories are ignored.
- Shared skills default to `needs-review`.
- Deprecated or unapproved vault skills cannot be auto-selected.
- The Skills status mutation sits behind the existing API admin authentication.
- No community skill source becomes trusted merely because it is discoverable.
- Instruction provenance is persisted at execution creation, not reconstructed later from mutable skill state.
