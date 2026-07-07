# Mission Control agent architecture

Mission Control is the agent-agnostic orchestration layer. It is not James and it is not Hermes. James, Hermes, Codex, Gemini, OpenCore/OpenClaw, and future custom workers should be modeled as pluggable agents/operators with explicit capabilities, permissions, skills, task access, repository access, tool access, memory access, status, and audit trails.

## Current architecture in the repo

### Platform layer

Mission Control currently provides:

- React dashboard for tasks, team, memory, skills, repositories, content, calendar, contacts, and settings.
- Express API mounted at `/api`.
- PostgreSQL/Drizzle domain tables for operational data.
- Admin token gating for dashboard APIs.
- Bearer-token gated bridge routes for agents.
- Skills registry based on `SKILL.md` files.
- Tool and integration registries with agent assignment/access tables.
- Activity feed and basic audit records for some dispatch/token events.

### Agent records

Persistent agents live in the `agents` table. Built-in configured agents are also returned by `GET /api/agents` when not present in the database. The current configured list includes James, Scout, Scribe, Reach, Dev/Codex, and OpenClaw/Bob. James is currently assigned the `Orchestrator` role, but the product remains Mission Control.

### Agent bridge

The agent bridge is pull-oriented and token-gated:

1. Admin creates/updates an agent and can regenerate an inbound token.
2. Admin dispatches a command to an agent, creating an `agent_commands` row.
3. Agent calls `POST /api/agent/ping` with its bearer token.
4. Mission Control returns tasks assigned to that agent name plus unacknowledged commands.
5. Agent acknowledges a command with `POST /api/agent/command/:id/ack`.
6. Agent reports activity, task completion, or memory with `POST /api/agent/report`.

### Skills registry

Skills are markdown instruction documents named `SKILL.md`. Mission Control scans the skills root, exposes metadata and document content to admins, and exposes filtered skills to authenticated agents. Current skill assignment is static/name-based in `config-operational-agents.ts`.

### James/Hermes relationship

- James is currently integrated through API routes that call `/usr/local/bin/james-hermes`.
- Hermes may exist as a separate runtime, workspace, or service, but Hermes is not Mission Control.
- The James routes are an integration adapter and should not define the platform boundary.

## Intended architecture

### Core entities every agent should eventually expose

Each agent should have explicit, queryable fields for:

- Identity: name, provider, model/runtime, endpoint, owner/team.
- Role: orchestrator, builder, researcher, writer, reviewer, operator, support, custom.
- Permissions: read/write boundaries, environment access, approval gates, data scopes.
- Skills: assigned skill ids/categories and effective skill documents.
- Memory: which memory categories/scopes can be read or written.
- Task access: allowed task projects/types/status transitions.
- Repository access: allowed repositories/worktrees/branches/actions.
- Calendar access: read/write scopes and approval requirements.
- Contacts access: read/write scopes and PII boundaries.
- Tool access: granted tools, credentials policy, and revocation state.
- Execution mode: local process, remote HTTP worker, hosted model, CLI adapter, human-in-the-loop.
- Audit trail: dispatches, acknowledgments, reports, tool calls, memory writes, task mutations, permission changes.
- Status/availability: online/idle/offline/error, last ping, current task, queue depth.

### Routing model

Mission Control should route work by deterministic policy, not by hardcoded personality assumptions. A routing decision should evaluate:

1. Task type and project.
2. Required skills/capabilities.
3. Agent role and current availability.
4. Permissions and environment constraints.
5. Repository/tool/calendar/contact access requirements.
6. Safety gates and approval requirements.
7. Audit requirements.
8. Fallback policy when no agent qualifies.

If no agent qualifies, Mission Control should return `UNASSIGNED` or `INSUFFICIENT PERMISSIONS`; it should not guess.

### Capability registry

A future capability registry should separate these concepts:

- Agent identity: who/what the worker is.
- Capability: what the worker can do.
- Permission: what the worker is allowed to do.
- Skill: instruction pack used by the worker.
- Tool: callable external system or credential-backed action.
- Integration: connected third-party service or repository.

### Task assignment model

Current task assignment is primarily text/name based. The desired model is:

- Task declares required capabilities, project/repository scope, sensitivity, environment, and expected outputs.
- Router computes eligible agents.
- Assignment creates a durable decision record explaining why the agent was selected.
- Dispatch creates a command with immutable instructions/context.
- Agent reports status and result.
- Mission Control records audit events and updates task state only through validated transitions.

### Memory access model

Current memory records are simple shared rows. Desired behavior:

- Memory has scope/category and access policy.
- Agent can only read memory allowed by role, task, and project.
- Agent memory writes are attributed and auditable.
- Routing can include relevant memory only when policy allows it.

### Skills model

Current skills become usable when stored as `SKILL.md` under the skills root and exposed by `/api/agent/skills`. Desired behavior:

- Skills have stable ids, source provenance, version/commit, enabled state, category, and compatibility metadata.
- Agents have explicit skill grants rather than only static name-based defaults.
- Dispatch includes only the minimum required skills for the assigned task.
- Skill sync status remains inspectable and auditable.

### Permissions and audit trail

Current audit coverage exists around selected bridge actions. The desired model should audit:

- Agent creation/update/token regeneration.
- Permission, tool, integration, skill, memory, and repository grant changes.
- Routing decisions.
- Dispatch payloads and acknowledgments.
- Agent reports and task transitions.
- Tool invocations and external side effects.

Secrets and tokens must never be logged in plaintext.

## Extension rules for future agents

To add Codex, Gemini, OpenCore/OpenClaw, Hermes, or another worker safely:

1. Add or configure an agent identity.
2. Declare role and capabilities.
3. Grant only required tools/integrations/repositories/memory scopes.
4. Assign skills explicitly.
5. Choose execution mode: bridge polling, HTTP callback, local CLI adapter, or human-operated.
6. Create dispatch and report contracts.
7. Add smoke checks that verify health without performing production side effects.
8. Keep all runtime-specific code behind an adapter boundary.

Do not hardcode future workers into unrelated UI or task flows. Prefer data-driven registries over name checks.
