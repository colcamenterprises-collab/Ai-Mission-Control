# Mission Control deploy command

Run the Mission Control deployment from the production host with one command:

```bash
./scripts/deploy-mission-control.sh
```

The script is intentionally fail-fast. It stops before restarting systemd if the checkout is not on `main`, the working tree has local changes, dependencies cannot be installed, the build fails, typecheck fails, the skills test fails, or the operational smoke check fails.

The deployment script follows the Mission Control deployment runbook and uses the documented Node/systemd runtime, `pnpm`, and `ai-mission-control-api.service` service name. It does not deploy with Docker and does not modify auth, Hermes, database schemas, or application behavior.

## Expected production path

The production checkout is expected at:

```bash
/opt/apps/ai-mission-control
```

If the command is launched from another directory inside the Git checkout, the script resolves the repository root before continuing. It prints a warning if the resolved checkout is not `/opt/apps/ai-mission-control`.

## What the command does

1. Confirms or resolves the repository root.
2. Prints the current branch and commit.
3. Prints and checks `git status --short`.
4. Refuses to continue if any local changes exist. No local files are currently documented as safe to ignore for deployment.
5. Fetches `origin main`.
6. Pulls with `git pull --ff-only origin main`.
7. Installs dependencies with `pnpm install --frozen-lockfile`.
8. Builds with `pnpm run build`.
9. Runs typecheck with `pnpm run typecheck`.
10. Runs the skills test with `pnpm run test:skills`.
11. Runs the operational smoke check when the `smoke:operational` script is available.
12. Restarts `ai-mission-control-api.service` only after install, build, typecheck, skills test, and smoke check pass.
13. Prints systemd service status.
14. Prints recent service logs.
15. Verifies local health and, when an admin token is available, the skills route.
16. Prints the deployed commit SHA and verification URLs/routes.

## Required runtime environment

The operational smoke check requires a local service URL and admin token. The script uses:

- `PORT` for `http://127.0.0.1:$PORT`.
- `MISSION_CONTROL_ADMIN_TOKEN` or `VITE_MISSION_CONTROL_ADMIN_TOKEN` for authenticated smoke checks.
- `BASE_PATH` when the frontend build requires it.

If these variables are not already exported, the script attempts to read them from the `ai-mission-control-api.service` systemd environment. If required values are still missing, the script exits with a clear error instead of reporting success.

## Verification routes printed by the script

The script prints these verification URLs/routes at the end of a successful deploy:

```text
http://127.0.0.1:$PORT/api/healthz
http://127.0.0.1:$PORT/api/skills
http://127.0.0.1:$PORT/api/tasks
http://127.0.0.1:$PORT/api/agents
http://127.0.0.1:$PORT/api/worktrees/diagnostics
https://mission.customli.io/api/healthz
https://mission.customli.io/api/skills
```
