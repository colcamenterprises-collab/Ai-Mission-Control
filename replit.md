# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Mission Control — Features

Full-stack dark-mode command center. Electric cyan (#00D4FF) on deep navy (#0A0F1E).

### Pages
- Dashboard, Tasks Board, Content Pipeline, Calendar, Memory Library, AI Team View, Contacts/CRM, Settings

### AI Agent Plugin System
- DB schema: `agentsTable` has `provider`, `model`, `apiKey`, `apiKeyHint`, `endpoint`, `isPluggedIn` columns
- Team page: 2-step "Plug In Agent" wizard (7 providers: OpenAI, Anthropic, Google, Mistral, Cohere, OpenRouter, Custom)
- API key masked server-side (`apiKeyHint` = last 4 chars)

### 3rd-Party App Tool Integrations (complete)
- DB tables: `integrationsTable`, `agentIntegrationsTable` in `lib/db/src/schema/integrations.ts`
- Full CRUD API: `/api/integrations`, `/api/integrations/:id`, `/api/integrations/:id/agents`, `/api/agents/:id/integrations`
- Settings → App Connections: "Connect App" wizard (name, URL, category, description, API key, public toggle)
- Each app card shows: icon, category, status, description, URL, Agents/Open/Disconnect actions
- Manage Agents dialog: assign/unassign agents to apps with optional role
- Team page agent detail: shows "Assigned Apps" with clickable chips linking to external URLs

### Patterns
- `serializeDates()` at `artifacts/api-server/src/utils/serialize.ts` — always call before `.parse()` on Drizzle results
- Wouter navigation: `const [, navigate] = useLocation()`
- OpenAPI codegen: `pnpm --filter @workspace/api-spec run codegen`
