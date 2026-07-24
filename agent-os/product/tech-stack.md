# Mission Control Tech Stack

## Runtime

- Node.js API server served by systemd as `ai-mission-control-api.service`.
- React frontend served by nginx from `artifacts/mission-control/dist/public`.
- PostgreSQL local database on Hostinger.
- Drizzle ORM schemas in `lib/db`.

## Worker providers

- James Hermes internal worker route: `/api/james/message`.
- OpenRouter compatible chat completions.
- OpenAI chat completions.
- Claude Messages API.
- Custom webhook endpoints.

## Deployment

Only use:

```bash
scripts/deploy-mission-control.sh
```

The deploy must pass typecheck, builds, skills test, nginx syntax check, service restart, local API health, public API health, authenticated skills check, and frontend public check.

## Safety

- No direct database destructive changes without explicit owner approval.
- No SBB production changes unless explicitly approved.
- Additive schema changes only unless approved.
- Secrets must be encrypted at rest and masked in owner UI.
