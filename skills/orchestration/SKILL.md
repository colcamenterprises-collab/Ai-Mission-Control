---
name: orchestration
title: Mission Control Orchestration
category: operations
description: Routes work to real connected AI workers, checks access, and reports outcomes without fake execution.
---

# Mission Control Orchestration

Use this skill when Mission Control receives work that must be routed to an AI worker.

## Operating rules

1. Only route work to a real connected agent.
2. Do not invent agents, tools, reports, or results.
3. Check whether the agent has the required tools, secrets, and context before work starts.
4. If access is missing, keep the task on the work board and report the blocker.
5. Queue a clear command that includes the task goal, constraints, expected output, and reporting requirement.
6. Agents must report progress back through Mission Control rather than silently completing work elsewhere.

## Minimum routing packet

Every command should include:

- Task title
- Task brief
- Business/project context
- Priority
- Assigned AI worker
- Allowed tools
- Relevant knowledge or playbooks
- Required output
- Report-back instruction

## Report-back expectation

The assigned agent should return one of:

- Work completed
- Work in progress
- Blocked: access required
- Blocked: owner approval required
- Blocked: external system unavailable

## Safety rule

If there is no connected worker that can complete the task, Mission Control should not pretend work has started. It should create the work item as unassigned and tell the operator what connection is missing.
