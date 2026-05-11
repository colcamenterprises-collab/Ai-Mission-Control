# Mission Control

A full-stack dark-mode AI command center for managing agents, tasks, content, contacts, and memory — built as a pnpm monorepo.

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Runtime | Node.js 24 |
| Language | TypeScript 5.9 |
| API | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod v4, drizzle-zod |
| Frontend | React + Vite + Tailwind + shadcn/ui |
| API Codegen | Orval (OpenAPI → React Query hooks + Zod schemas) |
| Build | esbuild (CJS bundle) |

## Getting Started

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Fill in DATABASE_URL and SESSION_SECRET

# Push database schema
pnpm --filter @workspace/db run push

# Run the API server
pnpm --filter @workspace/api-server run dev

# Run the frontend
pnpm --filter @workspace/mission-control run dev
```

## Project Structure

```
.
├── artifacts/
│   ├── api-server/        # Express 5 API server
│   └── mission-control/   # React + Vite frontend
├── lib/
│   ├── api-spec/          # OpenAPI spec (source of truth)
│   ├── api-client-react/  # Generated React Query hooks
│   ├── api-zod/           # Generated Zod validation schemas
│   └── db/                # Drizzle ORM schema + client
├── scripts/               # Shared utility scripts
├── .env.example
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Key Commands

```bash
pnpm run typecheck                          # Full typecheck across all packages
pnpm run build                              # Typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen  # Regenerate API hooks + Zod schemas
pnpm --filter @workspace/db run push        # Push DB schema changes (dev only)
```

## Features

### Pages
- **Dashboard** — activity feed, agent status, quick stats
- **Tasks** — Kanban board with priority and assignee
- **Content Pipeline** — draft → review → published workflow
- **Calendar** — event scheduling
- **Memory Library** — persistent agent memory documents
- **AI Team** — agent management with bridge integration
- **Contacts / CRM** — contact and company records
- **Settings** — agent tool vault, app connections, cron jobs, config

### Agent Bridge API

Agents connect to Mission Control via a secure bearer-token bridge:

| Endpoint | Purpose |
|---|---|
| `POST /api/agent/ping` | Heartbeat — returns pending tasks and queued commands |
| `POST /api/agent/report` | Push activity, task completion, or memory |
| `POST /api/agent/command/:id/ack` | Acknowledge a dispatched command |
| `GET /api/agent/tools` | Fetch full tool credentials (API keys, logins) |
| `POST /api/agents/:id/dispatch` | Send instructions to an agent |
| `POST /api/agents/:id/token` | Generate / regenerate agent bearer token |

### Agent Tool Vault

Stores third-party credentials (API keys, username/password, bearer tokens) that agents fetch at runtime. Credentials are masked in the UI and only returned in full to authenticated agents via their bearer token.

### AI Provider Support

Agents are provider-agnostic. Supported model providers (optional): OpenAI, Anthropic, Google, Mistral, Cohere, OpenRouter, Custom endpoint.

## Environment Variables

See `.env.example` for required variables.

## License

MIT — see [LICENSE](LICENSE)
