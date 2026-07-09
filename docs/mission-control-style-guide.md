# Mission Control UI Style Guide

This guide defines the design rules for Mission Control so future agent patches keep the interface simple, visual, and consistent.

## Direction

Mission Control should feel like a premium command centre, not a form-heavy admin panel.

Core rules:

- Visual first, text second.
- Dashboard is for status, movement, signals, and quick links.
- Task creation belongs inside **Tasks + Chat**, not the dashboard.
- Users should not need to choose an agent for normal tasks. The orchestrator receives the task and allocates it.
- Inputs should be minimal and consistent.
- Every section should answer one question only.

## Brand

- Primary brand mark: Customli logo in the sidebar header.
- Sidebar app name text should not compete with navigation.
- The light/dark control should be a pill toggle, not a loose icon.

## Typography

Use one modern UI font stack across the app:

```css
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Use mono font only for small labels, counters, status markers, and system-style captions:

```css
"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace
```

Sizing:

| Use | Size | Weight | Notes |
| --- | ---: | ---: | --- |
| Page title | clamp(2rem, 4.2vw, 4rem) | 620 | Tight tracking |
| Section title | 1.4rem–2rem | 650 | Short labels only |
| Body/input | 0.875rem | 400 | Default UI size |
| Card title | 0.86rem–1rem | 600 | Compact |
| Label/caption | 0.65rem–0.75rem | 600 | Uppercase mono |

## Layout

Dashboard should show:

- command status visual
- small KPI tiles
- workflow bars
- memory graph
- installed agents
- current work preview
- quick links

Dashboard should not show:

- long instructions
- task creation forms
- detailed settings
- token setup
- manual agent allocation

Tasks + Chat should show:

- task input to orchestrator
- current task lanes
- chat/command thread area when built
- task lifecycle visibility

## Components

Cards:

- dark glass panel
- 1rem radius
- subtle border
- low text density
- hover only when actionable

Inputs:

- consistent 0.875rem font
- rounded 0.75rem
- short placeholder text
- no paragraphs explaining how to use them

Buttons:

- short verbs only: Send, Open, View, Manage
- icon + label where helpful
- avoid long CTA copy

## Task creation standard

Normal flow:

```text
User writes task → Orchestrator reviews → Orchestrator allocates → Agent command queued
```

The UI must not ask the user to nominate the agent in the standard flow.

Advanced/manual allocation can exist later, but it should be hidden behind an advanced control.

## Current implementation notes

The current visual style rules are implemented in:

```text
artifacts/mission-control/src/mission-ui.css
```

The sidebar brand is implemented in:

```text
artifacts/mission-control/src/components/customli-logo.tsx
```

The dashboard visual overview is implemented in:

```text
artifacts/mission-control/src/pages/dashboard.tsx
```

The orchestrator task intake now sits under:

```text
artifacts/mission-control/src/pages/tasks.tsx
```
