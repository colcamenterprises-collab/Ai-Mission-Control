# Mission Control V1.0 — Agent Employment Pack

**Classification:** CURRENT  
**Effective:** 2026-09-01  
**Patch:** Ground Zero 1.1

## Purpose

A Mission Control AI employee is not defined only by a model, personality prompt or runtime. Every employee must have an operational Employment Pack that states what the role exists to achieve, what it owns, what authority it has, which systems and skills it needs, how it communicates, when it escalates, how success is measured and what it must never do.

The model/runtime is replaceable compute. The Employment Pack belongs to Mission Control and remains stable when the underlying provider or model changes.

## Employment Pack sections

Every pack contains:

1. **Role** — title, business scope and purpose.
2. **Responsibilities** — outcomes owned, supporting responsibilities and recurring work boundary.
3. **Delegations** — autonomous authority, orchestrator authority, owner-only authority and prohibited actions.
4. **Systems** — required/optional systems and access rules.
5. **Skills** — required/preferred capabilities and role certification requirement.
6. **Communication** — owner, orchestrator and peer styles plus reporting format.
7. **Escalation** — genuine escalation conditions, non-escalation conditions and evidence required.
8. **Success** — required outcomes, quality bar and service-level expectations.
9. **Boundaries** — prohibited behaviour, data boundaries and external-action boundaries.

## Hiring from a concise role brief

`POST /api/employee-factory/hire` uses the existing employee-creation inputs — job title, responsibilities, project/business and manager — as the concise role brief. Mission Control creates a complete first-pass Employment Pack automatically at hire time.

This means a new employee starts with an operational definition instead of a blank personality record. The generated pack is intentionally conservative: it grants routine research, inspection, internal communication, evidence gathering and reversible role decisions while retaining owner approval for protected financial, destructive, credential/security, material expenditure and consequential external actions.

The owner can refine the pack in **Team → Employee → Employment**.

## Certification

Mission Control calculates an Employment Pack certification score. Certification requires, at minimum:

- role purpose;
- owned responsibilities;
- autonomous delegation;
- owner-approval boundary;
- required systems;
- required skills;
- owner communication style;
- reporting format;
- escalation condition;
- success outcomes;
- quality bar;
- hard boundaries.

A generated standard pack is structurally certifiable, but role-specific operational certification still requires a representative real task proving the employee can retrieve evidence, exercise judgement, use relevant systems, report correctly and escalate appropriately. Specialist certification is handled in role-specific patches such as Ground Zero 1.2 for Amanda.

## Runtime projections

The Employment Pack generates these portable role documents:

- `ROLE.md`
- `RESPONSIBILITIES.md`
- `DELEGATIONS.md`
- `SYSTEMS.md`
- `SKILLS.md`
- `COMMUNICATION.md`
- `ESCALATION.md`
- `SUCCESS.md`
- `BOUNDARIES.md`

They are written alongside the existing runtime projections (`IDENTITY.md`, `SOUL.md`, `AGENTS.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `MEMORY.md`) when an employee has an approved managed workspace.

Credentials never belong in these files.

## API and export contract

`GET /api/employee-factory/agents/:id/definition` returns the structured profile, Employment Pack, certification status and generated files.

`PUT /api/employee-factory/agents/:id/definition` persists edits, recalculates certification and synchronizes the complete generated file set into an approved managed runtime workspace when connected.

Portable employee export is schema version 3 and includes the Employment Pack, certification status and generated role documents. Secret values remain excluded.

## Relationship to Ground Zero 1.0

Ground Zero 1.0 established that James must keep active work moving within delegated authority. Ground Zero 1.1 gives James and each specialist a durable, explicit definition of what that authority means for the employee's role.

The two rules operate together:

`employee role + delegations + systems + skills → assigned work → orchestrator supervision → evidence-backed completion`

An employee should not ask the owner to resolve an ordinary problem that falls within its Employment Pack or James's delegated authority.
