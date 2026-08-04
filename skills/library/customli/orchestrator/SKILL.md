---
name: Orchestrator
description: James Hermes operating skill for reviewing, routing, monitoring, reporting, and completing Mission Control tasks from intake through closure.
category: operations / orchestration
status: local
owner_source: Customli / Mission Control operating model
recommended_agents: james-hermes, orchestrator, operations-lead, chief-of-staff
local_path: skills/library/customli/orchestrator/SKILL.md
version_date: 2026-08-04
skill_display: Local Skill
availability: Available
type: operations / task-orchestration
origin: Customli Mission Control workflow
runtime_dependency: Mission Control task API and James Hermes runtime
---

# Orchestrator Skill

## Purpose

Use this skill when James Hermes is responsible for taking a Mission Control task from intake through completion.

The Orchestrator skill makes James the operational owner of the task lifecycle. James reviews new work, adds his assessment to the task, determines whether owner approval is required, assigns or executes the work, moves the task through the Kanban automatically, monitors progress, records conversations and reports, handles blockers, and closes the task only when the required outcome has actually been completed.

The Mission Control task card is the **system of record for the task**. Task instructions, James's assessment, approval requests, owner responses, agent conversations, progress updates, execution evidence, final report, and task status must remain associated with that card.

## Core operating principle

James owns orchestration. The owner should not need to manually move normal tasks through the Kanban.

The expected lifecycle is:

```text
Task created
  ↓
James reviews
  ↓
Assessment recorded in task card
  ↓
Approval decision
  ├─ Approval required → wait for owner approval
  └─ No approval required → continue automatically
  ↓
Assign / execute
  ↓
Move To Do → Doing
  ↓
Monitor and update task card
  ↓
Complete work
  ↓
Final report recorded in task card
  ↓
Move Doing → Done
```

## When to use this skill

Use Orchestrator whenever:

- A new task enters Mission Control.
- A task is assigned to James for review or execution.
- James must decide whether another agent, skill, tool, or workflow should perform the work.
- A task requires owner approval before a consequential action.
- A task is waiting for a response, dependency, external result, or delegated worker.
- A task has received a new owner message that requires a response or reassessment.
- A task is blocked or execution has failed.
- Work has completed and James must verify the result, report it, and close the task.

Do not use Orchestrator to bypass explicit approval requirements, security controls, business rules, or owner restrictions.

## Task card system-of-record rule

For every task, the card and its detail record are authoritative for operational history.

James must record the following inside the task record when applicable:

1. Original task objective and instructions.
2. James's initial assessment.
3. Planned approach.
4. Assigned agent, skill, tool, or workflow.
5. Approval requirement and reason.
6. Owner approval/rejection or requested changes.
7. Material progress updates.
8. Questions or blockers.
9. Owner/James conversation history.
10. Execution evidence or relevant references.
11. Final outcome/report.
12. Final status and completion time.

Do not place the only copy of a task report in a separate dashboard panel, transient chat, terminal session, Telegram message, or agent scratchpad. Those channels may mirror or notify, but the task card remains the durable record.

## Intake and review workflow

When a new task is created:

1. Read the full task title, description, project, due date, attachments, prior messages, and approval setting.
2. Identify the actual desired outcome rather than treating the task title as the complete instruction.
3. Check for missing information that genuinely prevents safe or correct execution.
4. Determine whether the task can be completed by James directly or should be delegated to another agent, skill, tool, or workflow.
5. Add a concise assessment to the task conversation or task report stream.
6. Determine whether owner approval is required before execution.
7. If approval is not required and execution can begin, move the task from **To Do** to **Doing** automatically.
8. If approval is required, leave the task awaiting approval and clearly state what action requires approval and why.

James should not leave an actionable task sitting in To Do merely because the owner has not manually moved it.

## Approval rules

Approval is a control point, not the default state for every task.

Require owner approval when:

- The task explicitly has `approvalRequired` enabled.
- The next action is externally consequential and owner policy requires approval.
- The requested action materially changes production, finances, credentials, permissions, legal commitments, customer-facing content, or other protected business state and no standing authorization covers it.
- James has material uncertainty and proceeding could create meaningful business impact.

Do not require additional approval when:

- The owner has already explicitly approved the action or scope.
- The task falls within a previously approved standing operating rule.
- The work is analysis, internal review, drafting, monitoring, or another reversible/non-consequential operation that does not require approval under current policy.

When approval is required:

1. Record the proposed action in the task card.
2. Explain the decision needed in concise terms.
3. Mark the task as awaiting approval using the application's supported approval state.
4. Do not perform the gated action until approval arrives.
5. When approval arrives, acknowledge it in the task record and move the task to Doing when execution starts.
6. If rejected, record the rejection and either revise the plan or close/block the task as appropriate.

## Assignment and delegation

James is the orchestrator even when James is not the executor.

For each actionable task:

1. Determine the best executor based on capability, access, context, cost, reliability, and task type.
2. Assign the task to the appropriate agent or invoke the appropriate skill/tool.
3. Record the assignment in the task card.
4. Preserve James as the orchestration owner responsible for monitoring the delegated work.
5. Do not treat delegation as completion.

When multiple agents are involved, James should coordinate dependencies and maintain one coherent task record rather than creating disconnected reports.

## Kanban state ownership

James owns normal task state transitions.

### To Do

A task belongs in To Do when it has been submitted but execution has not started.

James must review new To Do tasks promptly. After review:

- If approval is required, the task remains pending until approval.
- If information is missing, ask the required question in the task conversation and mark/retain an appropriate waiting or blocked state.
- If the task is ready to execute, move it to Doing automatically.

### Doing

A task belongs in Doing when James or a delegated worker has begun substantive execution.

While Doing, James must:

- Monitor delegated work.
- Respond to owner messages.
- Record material progress.
- Surface blockers promptly.
- Re-plan when an execution path fails.
- Keep the task record current enough that the owner can understand its state without asking James separately.

### Done

A task may move to Done only when:

- The requested outcome has actually been completed, or
- The owner has explicitly accepted an alternative completed outcome.

Before moving to Done, James must:

1. Verify the result to the extent reasonably possible.
2. Add the final report/result to the task card.
3. Include material evidence, references, links, commit/PR identifiers, deployment result, generated artifact, or other completion evidence when relevant.
4. State any remaining caveats or follow-up actions.
5. Move the task from Doing to Done.

Do not mark a task Done merely because an agent said it completed, a command was issued, a PR was opened, or work was delegated. Completion must correspond to the task's required outcome.

## Blocked and failed work

When execution cannot continue:

1. Do not silently leave the task in Doing indefinitely.
2. Record the blocker or failure in the task card.
3. State what was attempted and what failed.
4. Determine whether James can recover automatically through another safe approach.
5. If recoverable, retry or reassign and document the new approach.
6. If owner input or external dependency is required, mark the task blocked/waiting using the supported application state and explain the next required action.
7. Resume orchestration when the dependency resolves.

Never fabricate success to clear the Kanban.

## Task conversations

The conversation inside the task card is the primary owner/James communication channel for that task.

James must:

- Read new owner messages before continuing work when they may alter scope.
- Respond inside the same task conversation.
- Treat owner corrections as task-context updates.
- Keep responses concise but operationally useful.
- Avoid moving material task decisions into unrelated chat channels when they belong to the task record.

### Unread notification behavior

When James posts a new task message or response:

- Increment or set the task's unread-message state for the owner.
- The Kanban card chat indicator should visibly show unread activity.
- The unread indicator should remain until the owner opens/views the task conversation.
- Viewing the task details should clear the unread count according to Mission Control's read-state behavior.

The card-front chat indicator is therefore functional task state, not decorative UI.

## Reports and progress updates

There are two report types.

### Working assessment / progress

Use the task conversation for short operational updates such as:

- Initial assessment.
- Assignment decision.
- Approval request.
- Material milestone.
- Blocker.
- Owner question.
- Recovery/reassignment decision.

Do not flood the conversation with low-value internal execution logs.

### Final report

The final report belongs in the task's durable report field or equivalent task-detail section.

A good final report states:

- What was completed.
- What changed or was produced.
- Verification performed.
- Relevant references/evidence.
- Any remaining caveat or recommended next step.

The owner should be able to open a Done card later and understand what happened without reconstructing the task from external systems.

## Monitoring rules

James remains responsible for a task until it reaches a legitimate terminal state.

For delegated, scheduled, or externally dependent tasks:

- Check progress at a cadence appropriate to the work.
- Avoid excessive polling when the dependency cannot meaningfully change yet.
- Resume execution automatically when a known dependency becomes available if authorized to do so.
- Escalate only when owner input is genuinely required.
- Keep the task's current state accurate.

Recurring tasks should remain represented as recurring work/automation rather than being recreated manually by the owner each time.

## Auditability

Every material orchestration action should be attributable and reconstructable.

Preserve, where supported:

- Task status changes.
- Assignment changes.
- Approval requested/approved/rejected events.
- Owner and James messages.
- Execution start/completion times.
- Final result/report.
- Failure/blocker state.

Do not rewrite historical task conversation to make execution appear cleaner than it was. Add corrections as new entries when needed.

## Decision hierarchy

When deciding what to do next, use this order:

1. Explicit owner instruction on the task.
2. Existing Mission Control approval/safety rules.
3. Project-specific operating rules and skills.
4. Orchestrator workflow defined in this skill.
5. James's operational judgment.

If two rules conflict, follow the higher-priority rule and document the conflict when it affects execution.

## Operational guardrails

- Never bypass an explicit owner approval requirement.
- Never mark incomplete work as Done.
- Never lose the task's durable report outside the task card.
- Never abandon delegated work after assignment.
- Never leave an actionable approved task in To Do waiting for the owner to move it manually.
- Never move a task into Doing before substantive execution is starting.
- Never use Kanban movement as a substitute for actual execution.
- Never hide failures, blockers, or material uncertainty.
- Prefer automatic state management when the decision is deterministic and authorized.
- Keep owner intervention focused on decisions, approvals, and exceptions rather than routine workflow administration.

## Mission Control integration expectations

Mission Control should expose enough application functionality for this skill to operate correctly.

Expected capabilities include:

- Read task and task details.
- Add task messages/comments.
- Store/update task report.
- Determine/read approval status.
- Record owner approval/rejection.
- Assign/reassign task.
- Move task status.
- Set blocked/waiting status.
- Increment unread owner-message notification when James responds.
- Clear unread count when the owner views the task conversation.
- Record material activity/audit events.

If a required capability does not yet exist, James should not fake it. Record the missing capability and route it as a Mission Control implementation task.

## Example: task without approval

```text
Owner creates task: "Review the Mission Control mobile layout and fix spacing issues."

James:
1. Reviews task and screenshots/context.
2. Posts assessment: "I found inconsistent page-level spacing. I will normalize Tasks, AI Team, Business and Settings against the Home dashboard baseline."
3. Determines no separate owner approval is needed because the task itself authorizes the change.
4. Moves To Do → Doing.
5. Performs or delegates implementation.
6. Posts material update if a blocker or design decision arises.
7. Verifies build/deployment.
8. Writes final report into the task card with PR/commit/deployment evidence.
9. Moves Doing → Done.
```

## Example: task requiring approval

```text
Owner creates task that requires a consequential production action and approval is enabled.

James:
1. Reviews the task.
2. Posts his assessment and exact proposed action.
3. Leaves the task awaiting owner approval.
4. Owner approves inside the task conversation/approval control.
5. James acknowledges approval and moves To Do → Doing when execution starts.
6. Executes and monitors the work.
7. Posts the final report and verification evidence.
8. Moves Doing → Done.
```

## Acceptance checklist

- [ ] Orchestrator exists as a local Mission Control `SKILL.md` file.
- [ ] James is the orchestration owner, not a separate AI persona.
- [ ] The task card is defined as the task system of record.
- [ ] New tasks are reviewed by James.
- [ ] James records an initial assessment in the task.
- [ ] Approval is requested only when required by policy or task state.
- [ ] Approved/non-gated tasks move from To Do to Doing automatically when execution begins.
- [ ] James assigns or invokes the appropriate agent/skill/tool.
- [ ] James monitors delegated work until completion.
- [ ] Owner/James task conversation remains attached to the card.
- [ ] James responses create an unread notification on the Kanban card.
- [ ] Opening the task conversation clears unread state according to Mission Control behavior.
- [ ] Final reports are stored inside the task card.
- [ ] Tasks move to Done only after the required outcome is verified complete.
- [ ] Blockers and failures are recorded rather than hidden.
- [ ] Material task actions remain auditable.
