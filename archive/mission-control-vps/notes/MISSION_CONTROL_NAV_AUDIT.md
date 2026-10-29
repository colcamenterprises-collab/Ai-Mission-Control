# Mission Control — Navigation & Naming Consistency Audit

**Task:** #125 | **Date:** 2026-09-20 | **Method:** read-only source inspection (App.tsx, layout.tsx, all 23 page components)

## 1. Executive summary

9 sidebar items were mapped to their route components and main page headings. **5 label↔heading mismatches** and **1 missing page heading** were found, plus **11 hidden functional routes** and **9 alias/redirect routes** that have no sidebar link. The mission of the report is: label → destination → page heading → recommended parent/child placement, all verified against source files.

## 2. Full consistency map

### 2.1 Sidebar items (from `layout.tsx`)

| # | Sidebar label | Href | Component | Page heading | Match? | Recommended placement |
|---|---------------|------|-----------|--------------|--------|-----------------------|
| 1 | **Dashboard** | `/` | Dashboard | **none — no `<h1>` found** | ❌ MISSING | Top-level (keep); add `<h1>Dashboard</h1>` |
| 2 | **Taskboard** | `/tasks` | TasksV2 | **Kanban** | ❌ MISMATCH | Top-level (keep); align label or heading |
| 3 | **Notes & Ideas** | `/notes` | Notes | Notes & Ideas | ✅ MATCH | Top-level (keep) |
| 4 | **Team** (group parent) | — | — | — | — | Keep group; move children per §4 |
| 5 | — | AI Team | `/team` | TeamUnified | **Your AI employees** | ❌ MISMATCH | Child of Team; align label or heading |
| 6 | — | Skills & Instructions | `/skills` | Skills | **Skills & Instructions** | ✅ MATCH | **Move from Team → Mission Brain children** (see §4) |
| 7 | — | Agent Operations | `/agent-operations` | AgentOperations | Agent operations | ✅ MATCH (case only) | Child of Team (keep) |
| 8 | — | Execution History | `/brain/executions` | Executions | Execution history | ✅ MATCH (case only) | Child of Mission Brain (URL already nested) |
| 9 | **Mission Brain** | `/brain` | MissionBrain | Mission Brain | ✅ MATCH | Top-level (keep) |
| 10 | **Settings** | `/settings` | Settings | **Setup** | ❌ MISMATCH | Utility (keep); align label or heading |

### 2.2 Hidden functional routes (exist in App.tsx, no sidebar link)

| # | Route | Component | Page heading | Recommended placement |
|---|-------|-----------|--------------|-----------------------|
| 1 | `/james` | JamesVoice | Talk to James | Top-level primary nav (core interaction) |
| 2 | `/content` | ContentPipeline | Marketing plan. | Top-level or Marketing group |
| 3 | `/memory` | Memory | Business knowledge. | Child of Mission Brain |
| 4 | `/workspaces` | Workspaces | Repositories | Child of Development group |
| 5 | `/reports` | Reports | Reports. | Top-level or child of Dashboard |
| 6 | `/approvals` | Approvals | Approvals | Top-level or child of Control group |
| 7 | `/signals` | Signals | Signals | Child of Mission Brain |
| 8 | `/client-pulse` | ClientPulse | Client Pulse | Child of Business group |
| 9 | `/contacts` | Contacts | People and customers. | Child of People/Business group |
| 10 | `/onboarding` | Onboarding | Getting Started | Child of Settings/Setup |
| 11 | `/brain/executions/:id` | Executions | (dynamic: requestedAction) | Child of Mission Brain (URL already nested) |

### 2.3 Alias/redirect routes (no sidebar link, redirect to another route)

| # | Route | Destination | Type |
|---|-------|-------------|------|
| 1 | `/dashboard` | Dashboard | Alias of `/` |
| 2 | `/calendar` | `/tasks` | Redirect |
| 3 | `/business` | `/brain` | Redirect |
| 4 | `/reports-summary` | Reports | Alias of `/reports` |
| 5 | `/team/manage` | `/team` | Redirect |
| 6 | `/agent-creation` | `/team?hire=1` | Redirect |
| 7 | `/secrets` | `/settings` | Redirect |
| 8 | `/executions` | `/brain/executions` | Legacy alias |
| 9 | `/executions/:id` | `/brain/executions/:id` | Legacy alias |

## 3. Flagged mismatches (sidebar label vs page heading)

| Sidebar label | Opens | Page heading | Flag |
|---------------|-------|--------------|------|
| **Dashboard** | `/` → Dashboard | **none (no `<h1>`)** | MISSING HEADING |
| **Taskboard** | `/tasks` → TasksV2 | **Kanban** | LABEL ≠ HEADING |
| **AI Team** | `/team` → TeamUnified | **Your AI employees** | LABEL ≠ HEADING |
| **Skills & Instructions** | `/skills` → Skills | **Skills & Instructions** | ✅ MATCH (was misread on first pass) |
| **Settings** | `/settings` → Settings | **Setup** | LABEL ≠ HEADING |

Matches (verified):
- Notes & Ideas → Notes & Ideas ✅
- Agent Operations → Agent operations (case only) ✅
- Execution History → Execution history (case only) ✅
- Mission Brain → Mission Brain ✅

## 4. Placement analysis

### 4.1 Mission Brain boundaries

Current URL structure:
- `/brain` → MissionBrain ✅
- `/brain/executions` → Executions ✅ (correctly nested under Brain)
- `/brain/executions/:id` → Executions ✅ (correctly nested under Brain)
- `/executions` → Executions ❌ legacy alias outside Brain namespace
- `/executions/:id` → Executions ❌ legacy alias outside Brain namespace

Mission Brain internal nav (from `mission-brain.tsx`) treats Skills, Executions, and Agents as Brain facets:
- Brain → `/brain`
- Skills → `/skills`
- Executions → `/brain/executions`
- Agents → `/team`

This conflicts with the sidebar, which groups Skills and Execution History under "Team".

**Recommendation:** Move Skills & Instructions from Team group → Mission Brain children. This aligns sidebar with Mission Brain's own taxonomy. Legacy `/executions/*` aliases should redirect to `/brain/executions/*`.

### 4.2 Team/Skills/Instructions/Execution placement

Current Team group contains: AI Team, Skills & Instructions, Agent Operations, Execution History.

Recommended split:
- **Team group:** AI Team + Agent Operations + Hire AI Employee
- **Mission Brain children:** Memory/Knowledge + Skills & Instructions + Execution History + Signals

This matches the conceptual model where Mission Brain = knowledge + capabilities + execution history + intelligence, while Team = workforce management.

## 5. Evidence

- Routes: `/tmp/mc-notes-nav/artifacts/mission-control/src/App.tsx`
- Sidebar nav: `/tmp/mc-notes-nav/artifacts/mission-control/src/components/layout.tsx`
- Page headings verified via grep for `<h1>` in all 23 page components
- Dashboard confirmed no `<h1>` element in component source
- Skills page heading confirmed as `<h1>Skills & Instructions</h1>` (corrected from initial misread)