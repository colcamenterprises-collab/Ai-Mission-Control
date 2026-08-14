# Mission Control Orchestration V2 — Implementation Status

## Implemented on branch

Branch: `feature/mission-control-orchestration-v2`

### Mission Control workflow

- New V2 `/tasks` page with four visible areas: Ideas & To-Do, Doing, Changes Required, Done.
- Ideas are persisted separately from tasks in a new `ideas` table.
- Ideas do not dispatch automatically.
- Ideas can be converted explicitly into executable tasks.
- Normal task intake routes through James Hermes rather than directly selecting another connected worker.
- Routine intake no longer sets owner approval.
- Review/blocked workflow states are no longer treated by the V2 UI as automatic owner approvals.
- Done remains owner-archivable rather than auto-archived.
- Task and idea note fields include browser voice-transcription controls where supported.

### Attachments

- Attachments can be added after task creation.
- Ideas support attachments.
- Files are persisted on the server under `MISSION_CONTROL_UPLOAD_DIR` with generated filenames.
- Application file limit: 10 MB decoded per attachment.
- Attachment metadata is retained in the relevant task/idea record.
- Task attachment additions are recorded in task history.

### Sub-agent foundation

Approved profiles defined:

- Bob — General Admin
- Alex — Software Engineer
- Quinn — QA & Testing
- Mia — Data & Finance Analyst
- Sam — Operations Analyst
- Scout — Research Analyst

The repository also contains a new `agent_sessions` model and API foundation for task-scoped worker sessions.

## Not yet represented as a live worker runtime

The profile/session layer does not yet spawn an OpenClaw worker process. A runtime adapter is still required to:

1. receive James' selected profile and task package;
2. instantiate/connect the worker runtime;
3. inject Knowledge, Playbooks, Skills, attachments and permissions;
4. receive structured execution evidence;
5. close the runtime session and mark the Mission Control session terminal.

This runtime step should be completed after the intended worker runtime is available/configured on Hostinger.

## Deployment gates still required

Before merge/production deployment:

- run workspace typecheck/build;
- review any TypeScript/build diagnostics;
- verify additive database schema change;
- verify attachment storage permissions;
- verify authenticated attachment retrieval from the browser;
- test historical task compatibility;
- test idea-to-task conversion;
- test James routing with a funded/configured OpenRouter account;
- test final owner archive workflow.

## Pull request status

The connected GitHub write tools successfully created and updated the feature branch. Automated PR creation from this session was blocked by the tool safety layer, so the branch currently requires a PR to be opened/reviewed before merge.

Do not deploy this branch directly to production.
