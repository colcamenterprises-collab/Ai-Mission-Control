# Mission Control deployment runbook

This runbook documents the current repo-backed deployment flow without changing production behavior.

## Current runtime facts

Known production/server context supplied for this audit:

- Production repo path appears to be `/opt/apps/ai-mission-control`.
- GitHub source of truth: `colcamenterprises-collab/Ai-Mission-Control`.
- Service manager: systemd.
- Service name: `ai-mission-control-api.service`.
- Service command appears to run `/root/.local/bin/node dist/index.mjs`.
- Mission Control is not currently running as a Docker container.
- Hermes may run separately, but Hermes is not Mission Control.
- Package manager is `pnpm`.

Repo-confirmed runtime facts:

- API server requires `PORT` and `DATABASE_URL`.
- API source package is `artifacts/api-server`.
- API production bundle is `artifacts/api-server/dist/index.mjs`.
- Frontend source package is `artifacts/mission-control`.
- Frontend production assets build to `artifacts/mission-control/dist/public`.
- The API server does not serve frontend static assets in this checkout.
- No Dockerfile, docker compose file, PM2 config, nginx config, or systemd unit is present in this repo.

## One reliable current deployment flow

Run on the production host unless otherwise noted.

```bash
cd /opt/apps/ai-mission-control
git status --short
git fetch origin
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm run build
MISSION_CONTROL_SMOKE_BASE_URL=http://127.0.0.1:$PORT MISSION_CONTROL_ADMIN_TOKEN="$MISSION_CONTROL_ADMIN_TOKEN" pnpm run smoke:operational
sudo systemctl restart ai-mission-control-api.service
sudo systemctl status ai-mission-control-api.service --no-pager
sudo journalctl -u ai-mission-control-api.service -n 100 --no-pager
curl -fsS http://127.0.0.1:$PORT/api/healthz
curl -fsS -H "Authorization: Bearer $MISSION_CONTROL_ADMIN_TOKEN" http://127.0.0.1:$PORT/api/skills
```

Important notes:

- `git pull --ff-only origin main` is the safe pull command because GitHub/main is the source of truth and production should not create merge commits.
- Run `git status --short` first. If it prints local modifications, stop and inspect before pulling.
- The smoke script checks authenticated routes and requires `MISSION_CONTROL_ADMIN_TOKEN`.
- If `$PORT` is not exported in the shell, read it from the systemd environment first; the Node app will not start without it.

## Build commands

Preferred full build:

```bash
pnpm run build
```

Package-specific builds if isolating an issue:

```bash
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/mission-control run build
```

Frontend builds require `PORT` and `BASE_PATH` because `artifacts/mission-control/vite.config.ts` fails fast when either is absent.

## Test and smoke commands

Repository checks:

```bash
pnpm run typecheck
pnpm run test:skills
```

Operational smoke against a running service:

```bash
MISSION_CONTROL_SMOKE_BASE_URL=http://127.0.0.1:$PORT MISSION_CONTROL_ADMIN_TOKEN="$MISSION_CONTROL_ADMIN_TOKEN" pnpm run smoke:operational
```

Health and key route checks:

```bash
curl -fsS http://127.0.0.1:$PORT/api/healthz
curl -fsS -H "Authorization: Bearer $MISSION_CONTROL_ADMIN_TOKEN" http://127.0.0.1:$PORT/api/skills
curl -fsS -H "Authorization: Bearer $MISSION_CONTROL_ADMIN_TOKEN" http://127.0.0.1:$PORT/api/tasks
curl -fsS -H "Authorization: Bearer $MISSION_CONTROL_ADMIN_TOKEN" http://127.0.0.1:$PORT/api/agents
curl -fsS -H "Authorization: Bearer $MISSION_CONTROL_ADMIN_TOKEN" http://127.0.0.1:$PORT/api/worktrees/diagnostics
```

Domain verification if nginx/proxy is configured on host:

```bash
curl -fsS https://mission.customli.io/api/healthz
curl -fsS -H "Authorization: Bearer $MISSION_CONTROL_ADMIN_TOKEN" https://mission.customli.io/api/skills
```

## Restart, status, and logs

```bash
sudo systemctl restart ai-mission-control-api.service
sudo systemctl status ai-mission-control-api.service --no-pager
sudo journalctl -u ai-mission-control-api.service -n 100 --no-pager
sudo journalctl -u ai-mission-control-api.service -f
```

To inspect exact service configuration on the host:

```bash
sudo systemctl cat ai-mission-control-api.service
sudo systemctl show ai-mission-control-api.service --property=ExecStart,WorkingDirectory,Environment,EnvironmentFiles
```

## nginx verification

The repo has no nginx config. Verify host routing with:

```bash
sudo nginx -T | sed -n '/mission.customli.io/,+80p'
sudo systemctl status nginx --no-pager
sudo journalctl -u nginx -n 100 --no-pager
```

Questions to answer from host config:

- Does `mission.customli.io` proxy `/api` to Node?
- Does nginx serve `artifacts/mission-control/dist/public` directly?
- Does nginx proxy all paths to Node or another frontend server?

This repo alone cannot prove those answers.

## Rollback procedure

Use a git commit rollback, rebuild, restart, and verify sequence:

```bash
cd /opt/apps/ai-mission-control
git status --short
git log --oneline -n 10
git checkout <known-good-commit>
pnpm install --frozen-lockfile
pnpm run build
sudo systemctl restart ai-mission-control-api.service
sudo systemctl status ai-mission-control-api.service --no-pager
curl -fsS http://127.0.0.1:$PORT/api/healthz
```

If production must stay on a branch rather than detached HEAD, create a rollback commit or reset only under the repository owner's release policy. Never push directly to main.

## Existing deploy automation audit

No safe one-command deploy script exists in this repo.

Existing scripts:

- `scripts/smoke-operational.mjs`: useful operational smoke script.
- `scripts/sync-external-skills.mjs`: legacy/external skills sync path.
- `scripts/post-merge.sh`: not a deploy script and currently suspicious because it runs `pnpm --filter db push`, but the package is named `@workspace/db` and no `push` script is defined in `lib/db/package.json`.

## Proposed future one-command deploy script

Do not create this until production environment details are confirmed. Recommended path: `scripts/deploy-mission-control.sh`.

Proposed behavior:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /opt/apps/ai-mission-control

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to deploy: working tree has local changes." >&2
  git status --short
  exit 1
fi

git fetch origin
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm run build
pnpm run test:skills
MISSION_CONTROL_SMOKE_BASE_URL="${MISSION_CONTROL_SMOKE_BASE_URL:-http://127.0.0.1:${PORT:-3000}}" \
  MISSION_CONTROL_ADMIN_TOKEN="${MISSION_CONTROL_ADMIN_TOKEN:?MISSION_CONTROL_ADMIN_TOKEN required}" \
  pnpm run smoke:operational
sudo systemctl restart ai-mission-control-api.service
sudo systemctl status ai-mission-control-api.service --no-pager
sudo journalctl -u ai-mission-control-api.service -n 100 --no-pager
```

Open item before implementing: confirm whether smoke should run before restart against the currently live service, after restart against the new build, or both. The safest final script likely builds/tests first, restarts, then runs live smoke checks.
