# First Visual Frontend Implementation Brief

This document defines the first safe implementation PR after the visual-first product strategy. It intentionally avoids deep backend changes, billing, tenant migration, or agent runtime changes.

## Objective

Make Mission Control immediately clearer and more premium for non-technical business owners without breaking the current deployment.

This is the first visible step away from a technical dashboard and toward a high-end self-serve business operating system.

## Non-goals

Do not implement in this first PR:

- billing
- paid plans
- multi-tenant workspace migration
- authentication changes
- new agent runtimes
- real file import parsing
- repository/code intelligence changes
- Hermes-specific logic
- fake data

## Product direction

Mission Control should become:

- visual first
- premium minimal
- dark luxury SaaS aesthetic
- business-owner friendly
- plain-English
- card based
- consistent
- low text density
- guided by action cards and short labels

## First implementation scope

### 1. Rename primary navigation labels

Replace technical sidebar labels with business-friendly labels.

Target primary nav:

- Overview
- Tasks
- People
- AI Team
- Knowledge
- Playbooks
- Marketing
- Planner
- Contacts
- Reports
- Setup

Conditional/advanced nav:

- Projects
- Connected Apps
- Automations
- Billing
- Developer Tools

For the first PR, preserve existing routes where possible. This should be mostly label/copy change, not a routing rewrite.

Example:

- `/dashboard` can display as Overview
- `/team` can display as People or AI Team depending existing page purpose
- `/memory` can display as Knowledge
- `/skills` can display as Playbooks
- `/content` can display as Marketing
- `/calendar` can display as Planner
- `/settings` can display as Setup

If there is currently one page mixing human team and agents, use the safest label for the existing content and document follow-up split.

### 2. Establish visual design tokens

Create or centralise basic UI tokens for:

- font family
- font sizes
- line heights
- spacing
- radius
- card backgrounds
- border colours
- accent colour
- muted text
- status pills
- shadows/glow

The first target aesthetic:

- dark base
- near-black panels
- soft borders
- premium card surfaces
- controlled neon accent
- minimal white text
- muted helper text
- rounded cards
- no random font sizes

Do not introduce large external design frameworks unless already used.

### 3. Reduce text density

Update main page headings and helper text so each page has:

- one short title
- one short subtitle/helper line
- cards or simple sections
- no large explanatory blocks in the main view

Detailed explanations should move into help text, tooltips, drawers, or docs.

### 4. Redesign Overview page first

The Overview page should become a card-based dashboard.

Recommended sections:

- Welcome / workspace status card
- Today's focus
- AI Team status
- Recent activity
- Quick actions
- Setup progress

Use existing data only. If data is unavailable, use high-quality empty states, not fake metrics.

Examples of empty states:

- "No tasks yet. Create your first task or ask your AI Team to plan the day."
- "No knowledge uploaded yet. Add a file your business already uses."
- "No AI team members yet. Employ your first AI team member."

### 5. Begin AI Team language

Where the UI currently says agents in a user-facing context, prefer AI Team.

Primary CTA:

> Employ your next team member

Starter cards or empty state copy:

- Operations Assistant
- Admin Assistant
- Marketing Assistant
- Customer Support Assistant
- Research Assistant
- Project Assistant

Do not wire fake agents. This first PR may only update labels, empty states, and the entry CTA if the creation flow is not ready.

### 6. Standardise cards

Create or update reusable card patterns:

- metric card
- action card
- status card
- empty state card
- agent card
- file/knowledge card

Cards should have consistent:

- radius
- padding
- heading scale
- helper text scale
- border
- background
- hover state

### 7. Button and CTA language

Use action-led wording:

- Add task
- Upload file
- Employ AI team member
- Create playbook
- Open planner
- Invite person
- Finish setup

Avoid:

- configure resource
- create runtime
- manage repository
- sync schema
- inspect provider

## Acceptance criteria

The first frontend implementation PR is acceptable when:

- navigation labels are plain-English
- Overview page feels visually cleaner and more premium
- typography is more consistent
- cards use a consistent style
- user-facing jargon is reduced
- empty states are business-friendly
- no fake data is added
- existing routes still load
- existing deployment script still passes
- smoke checks still pass

## Suggested file areas to inspect

Codex should inspect the repo before implementation and identify exact files. Likely areas:

- `artifacts/mission-control`
- sidebar/navigation components
- route/page components
- shared UI components
- global CSS/theme files
- layout shell

Do not guess filenames in the implementation. Inspect first.

## Follow-up implementation sequence

After this first PR:

1. Full Overview redesign
2. AI Team page and employ-agent wizard
3. Onboarding wizard shell
4. Knowledge upload/import UI shell
5. Brand kit settings UI
6. Workspace/tenant backend foundation
7. Plan/tier limits
8. Billing and signup site

## Final rule

Do not make the product more technical. Every visible change should make Mission Control easier for a normal business owner to understand.
