# Mission Control Orchestration V2

## Purpose

Mission Control is an autonomous orchestration system. Cameron owns direction and final acceptance. James Hermes owns orchestration. Specialist workers execute task-scoped work and report to James.

## Owner involvement

Owner approval is exceptional, not routine.

Cameron is only interrupted when:

1. James has independently verified that the task success milestone has been achieved and the task is ready for final owner acceptance/archive; or
2. a genuine owner-level blocker exists, such as expenditure, an irreversible/destructive action, an owner-only credential, a material business/scope decision, or another decision James cannot safely resolve under existing rules.

Routine implementation decisions, worker selection, retries, PR preparation, testing, corrections, internal review cycles, and James returning work to a worker do not require owner approval.

## Board model

Visible board:

- Ideas & To-Do
- Doing
- Changes Required
- Done

Ideas & To-Do is not an executable task state. It is an owner notebook for rough ideas, research questions, future work, notes, uploads, voice notes, and discussion. Nothing in this area is allocated or executed unless Cameron explicitly converts it to a task or explicitly instructs James to make it a task.

Executable tasks begin in Doing.

Changes Required is an internal orchestration state used when James has reviewed worker output and requires additional work.

Done means James has independently reviewed the result against the task success milestone and approved it for owner acceptance. Done is not archived automatically.

Archive is an explicit owner action and preserves the full task history.

## Orchestrator authority

James Hermes is the Mission Control CEO / Orchestrator. James may:

- interpret the task objective and success milestone;
- select workers;
- break work into work packages;
- inject relevant Knowledge, Playbooks, Skills, files, and constraints;
- monitor execution;
- resolve normal blockers;
- return incomplete work for correction;
- commission independent QA;
- repeat execution/review cycles without owner approval;
- decide when the task is ready for Done.

James must not bypass owner-only controls that are intentionally reserved for Cameron.

## Worker lifecycle

Use permanent worker profiles with temporary execution sessions.

A worker profile persists: identity, role, core instructions, playbooks, skills, permission set, tool access, default model/provider configuration, and reporting relationship.

A worker session is task-scoped. It receives the minimum relevant task context, executes, returns evidence to James, and closes when no longer required. Hidden task memory must not become the source of truth; important discoveries belong in task history, project/business Knowledge, a Playbook, or formal documentation.

## Review flow

Normal flow:

Task -> James -> Worker -> James review -> Changes Required if needed -> Worker correction -> James review -> optional independent QA -> Done -> Cameron archive.

Worker completion is not task completion.

## Attachments and voice

Documents and images must be addable throughout the full task lifecycle, not only at task creation. Later attachments become part of the same task history/context.

Voice transcription should feed the same note/comment system as typed text rather than create a separate workflow.

## Safety

Do not remove approval protections globally. Reclassify them so routine autonomous work no longer stops for owner approval while genuine owner-only decisions remain protected.

Historical tasks and task messages must remain valid after status/board changes. Avoid destructive migrations.