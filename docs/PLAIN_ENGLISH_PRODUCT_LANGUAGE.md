# Mission Control Plain-English Product Language

Mission Control is being redesigned for non-technical business owners. The interface must not feel like a developer console, infrastructure panel, or internal admin tool. It must feel like a premium business control room that explains itself visually.

## Product language rule

If a normal business owner would not understand the word immediately, do not use it in the primary interface.

Technical capability can still exist, but it must live behind simple wording, guided flows, and advanced settings.

## Primary navigation

Use this as the default business-owner navigation:

| Current / technical label | New product label | User meaning |
| --- | --- | --- |
| Dashboard | Overview | What is happening in the business today |
| Tasks | Tasks | Work that needs doing |
| Team | People | Human staff and collaborators |
| Agents | AI Team | AI workers the business can employ |
| Memory | Knowledge | Business information Mission Control can use |
| Skills | Playbooks | Reusable instructions, SOPs, and workflows |
| Repositories | Projects | Workspaces, client projects, codebases, or business systems |
| Content | Marketing | Campaigns, posts, drafts, and brand material |
| Calendar | Planner | Dates, meetings, and scheduled work |
| Contacts | Contacts | Customers, suppliers, partners, and leads |
| Reports | Reports | Numbers, summaries, and insights |
| Settings | Setup | Business setup, branding, billing, and preferences |

## Conditional / advanced navigation

These should not appear for every business by default. Show them only when relevant to the user's business type, plan, or enabled modules.

| Advanced label | When to show | Plain-English explanation |
| --- | --- | --- |
| Connected Apps | When integrations are enabled | Connect the tools your business already uses |
| Connected Systems | When technical integrations exist | Systems connected to Mission Control |
| Projects | For agencies, software teams, or multi-client businesses | Organise important work areas |
| Automations | Paid tiers / advanced setup | Actions Mission Control can run for you |
| Billing | Paid plans | Plan, invoices, and usage |
| Developer Tools | Advanced technical users only | Technical configuration for teams that need it |

## Do not lead with these words

Avoid these in primary navigation, empty states, onboarding, or top-level CTAs:

- repository
- provider
- endpoint
- runtime
- schema
- memory store
- vector
- adapter
- API key
- model config
- execution environment
- orchestration layer
- token
- commit
- branch
- MCP

They can exist in Advanced Setup, but not in the default business-owner experience.

## Page naming guidance

### Overview

Purpose: show the user what matters now.

Use wording like:

- Today's focus
- What needs attention
- Your AI team is working on
- Recent activity
- Quick actions

Avoid:

- system diagnostics
- execution logs
- infrastructure status
- internal route names

### AI Team

Purpose: make agents feel like useful team members, not system resources.

Use wording like:

- Employ your next team member
- Choose their role
- Give them a name
- Decide what they can help with
- Assign work
- Review activity

Avoid:

- create runtime
- configure provider
- model endpoint
- tool adapter
- execution policy

### Knowledge

Purpose: store the business knowledge Mission Control can use.

Use wording like:

- Upload business files
- SOPs
- Training guides
- Menus
- Price lists
- FAQs
- Brand documents
- How your business works

Avoid:

- memory chunks
- embedding records
- vector stores
- knowledge ingestion pipeline

### Playbooks

Purpose: reusable instructions for people and AI team members.

Use wording like:

- How we do things
- Step-by-step instructions
- Standard operating procedures
- Reusable workflows
- Training instructions

Avoid exposing raw `SKILL.md` language to non-technical users unless in advanced mode.

### Projects

Purpose: organise important business work.

For non-technical businesses, a project may be:

- a client
- a location
- a campaign
- an internal improvement
- a system being connected

For software teams, a project may also expose repositories/codebases in advanced mode.

### Marketing

Purpose: campaigns, drafts, posts, newsletters, assets, and brand activity.

Use wording like:

- Campaigns
- Drafts
- Scheduled posts
- Brand assets
- Ideas
- Approval needed

### Planner

Purpose: calendar made useful to normal businesses.

Use wording like:

- Upcoming
- Today
- This week
- Scheduled work
- Meetings
- Deadlines

## Empty states

Every empty state should be short, visual, and action-led.

Bad:

> No records found for this resource.

Good:

> No tasks yet. Create your first task or ask your AI Team to plan the day.

Bad:

> No repository has been connected.

Good:

> No projects connected yet. Add a project when you are ready to organise work or connect a system.

## Tone

Mission Control should sound like a calm, premium operating partner.

Use:

- clear
- direct
- confident
- business friendly
- calm
- short

Avoid:

- developer jargon
- hype
- long explanations
- chatty filler
- internal implementation details

## Interface copy limits

Main screens should use:

- one clear page title
- one short helper line
- visual cards
- action buttons
- tooltips or drawers for extra detail

Avoid large paragraphs in the main UI. Long explanations belong in help drawers, onboarding guides, or docs.

## Final product principle

Mission Control is built for business owners first. Technical power should exist underneath, but the surface must remain simple, visual, and plain-English.
