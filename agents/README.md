# Portable Agent Architecture

Mission Control separates organisational intelligence from the individual agent occupying a role.

## Required system orientation

Every current or future worker operating through Mission Control should review [`docs/mission-control/AGENT_SYSTEM_OVERVIEW.md`](../docs/mission-control/AGENT_SYSTEM_OVERVIEW.md) before undertaking platform work. The overview is provider/runtime agnostic and is reviewed manually at major Mission Control releases.

For platform or architecture changes, also use [`docs/mission-control/README.md`](../docs/mission-control/README.md) as the canonical system-document index.

## Structure

- `roles/` contains stable responsibilities, permissions and required capabilities.
- `profiles/` contains replaceable agent identity, working style and assignment information.
- Mission Brain remains the shared source of organisational memory, skills, projects and execution history.

Replacing an agent must not require copying another agent's personality or private working state. Reassign the stable role to a new profile, retain Mission Brain and project context, and explicitly migrate only approved agent-specific learning.

## Runtime rule

Agents consume shared Mission Brain context plus their assigned role and profile. An agent profile must never become the only location for business-critical knowledge.
