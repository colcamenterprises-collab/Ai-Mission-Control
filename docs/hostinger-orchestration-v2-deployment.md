# Hostinger Deployment Requirements — Mission Control Orchestration V2

## Scope

This release adds:

- James-first orchestration for executable owner tasks;
- owner approvals only for genuine owner blockers/final acceptance;
- a separate Ideas & To-Do workspace;
- task attachments at any stage;
- persistent attachment storage on the VPS;
- browser voice transcription in task/idea notes where supported;
- reusable specialist sub-agent profile definitions;
- task-scoped sub-agent session records for the permanent-profile / temporary-session model.

## Required Hostinger changes

### 1. Pull the release after PR merge

Deploy from the existing `/opt/apps/ai-mission-control` application directory using the same production branch/deployment process already used for Mission Control.

Do not deploy the feature branch directly to production. Merge the reviewed PR to `main` first.

### 2. Install dependencies and build

No new npm dependency is required for the attachment implementation. Existing Node built-ins are used for file persistence.

Run the normal workspace install/build commands used by this repository.

### 3. Database schema update

Two new additive tables are required:

- `ideas`
- `agent_sessions`

After taking a database backup/snapshot, run the repository's normal Drizzle schema update:

`pnpm --filter @workspace/db push`

Do not use `push-force` for this release.

The expected schema change is additive only. Existing task tables do not need destructive changes.

### 4. Persistent upload directory

Create a directory that is not replaced by normal Git deployments/build output, for example:

`/opt/apps/ai-mission-control-data/uploads`

The Linux account running the Mission Control API must have read/write access to this directory.

Set:

`MISSION_CONTROL_UPLOAD_DIR=/opt/apps/ai-mission-control-data/uploads`

Recommended ownership/permissions: the service account owns the directory; do not make the directory world-writable.

### 5. Environment values

Confirm the production service has:

- `DATABASE_URL`
- `MISSION_CONTROL_ADMIN_TOKEN`
- `MISSION_CONTROL_ENCRYPTION_KEY`
- `MISSION_CONTROL_UPLOAD_DIR=/opt/apps/ai-mission-control-data/uploads`
- `MISSION_CONTROL_PUBLIC_ORIGIN=https://mission.customli.io`
- `MISSION_CONTROL_ALLOWED_ORIGINS=https://mission.customli.io`

OpenRouter credit/key configuration for James remains unchanged by this code release. James must be connected/configured in Mission Control for intake to dispatch. If James is unavailable, executable work remains unassigned rather than bypassing James and being sent directly to another worker.

### 6. Service restart

Restart the Mission Control API and frontend using the existing systemd/service deployment process after the build and schema update.

### 7. Reverse proxy

No new public port is required.

Attachment downloads remain behind the existing authenticated `/api` reverse proxy. Ensure Nginx continues proxying `/api/*` to the Mission Control API without a request-body limit below the application attachment limit.

The application currently enforces a 10 MB decoded file limit. Set Nginx `client_max_body_size` comfortably above the base64 JSON payload, e.g. `15m` or `20m`, if the current value is lower.

### 8. Storage and backup

Add `/opt/apps/ai-mission-control-data/uploads` to the VPS backup plan if task/idea attachments are expected to be durable business records.

Database backups do not include the uploaded file bytes; the database stores attachment metadata/URLs while files live on disk.

### 9. Voice input

Voice transcription in this release uses the browser Web Speech API. It does not require a Hostinger service or storage change. Browser support/permission is required on the client device.

## Deployment verification

After deployment verify:

1. `/api/healthz` passes.
2. Mission Control opens `/tasks` successfully.
3. The board shows Ideas & To-Do, Doing, Changes Required and Done.
4. Creating an Idea does not create/dispatch a task.
5. Converting an Idea to a task creates an executable task and removes the idea.
6. A normal task is routed to James Hermes when James is connected.
7. A normal task does not display an owner approval requirement just because it is in review/blocked workflow state.
8. Upload a small image/PDF to a Doing task and verify it is stored under the persistent upload directory.
9. Upload a file to an Idea and verify it persists.
10. Confirm `/api/sub-agents/profiles` returns Bob, Alex, Quinn, Mia, Sam and Scout.
11. Create and complete a test sub-agent session record and confirm it returns to a terminal status without altering the permanent profile.
12. Move/complete a task through the normal agent workflow and confirm final Archive remains an explicit owner action.
13. Confirm historical tasks still load.
14. Confirm the upload directory survives a normal application redeploy.

## Sub-agent runtime note

The repository now contains the approved specialist profile definitions and the task-scoped session persistence/API foundation. Concrete execution still needs a runtime adapter that maps a selected profile/session to an actual worker runtime (OpenClaw or another configured provider), injects the task package, receives structured evidence, and terminates the worker session. Do not create long-lived always-running worker processes merely to represent dormant profiles.
