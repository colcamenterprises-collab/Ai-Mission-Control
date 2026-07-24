# Spec: Patch 2 — Agent OS Playbook Layer

## Goal

Turn Mission Control's markdown knowledge, standards, and specs into an operational playbook layer that workers can use when completing work.

## Problem

Mission Control has skills and markdown files, but they are not yet presented as a clear product operating layer. The user expects the MD files, standards, and specs to be visible and usable in Playbooks/Knowledge and injected into worker tasks.

## Scope

- Discover Agent OS markdown documents from `agent-os/product`, `agent-os/standards`, and `agent-os/specs`.
- Surface them in Playbooks with plain-English labels.
- Allow Mission Control to include relevant playbook context when routing work.
- Record which playbooks were attached to a task.
- Keep existing SKILL.md support.

## Out of scope for this patch

- Billing.
- Multi-tenant workspaces.
- Public marketplace of skills.
- Complex vector search.

## Acceptance criteria

- Playbooks shows product mission, roadmap, tech stack, agent standards, and current specs.
- James Hermes receives relevant Agent OS context in test/work dispatch.
- Work reports show that playbooks were used.
- No fake demo content is added.
- Deploy passes the standard Mission Control deploy script.
