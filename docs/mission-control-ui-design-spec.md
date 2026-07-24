# Mission Control UI Design Spec

## Design North Star

Mission Control should feel like a premium dark operating system where a business owner can calmly direct AI workers, review their work, and stay in control.

## Product Feel

Mission Control must feel:
- Dark
- Minimal
- Calm
- Sharp
- Structured
- Premium
- Operational
- Non-cluttered
- High contrast where needed
- Low-noise everywhere else

It must not feel like:
- A generic admin dashboard
- A neon crypto dashboard
- A developer console
- A cluttered analytics platform
- A toy AI app
- A bright SaaS template

## Core Visual Style

Use a deep matte dark theme as the default experience.

Recommended palette:
- App background: #0B0B0D / #0E0E11
- Panel background: #151517 / #18191C
- Raised card background: #1C1D20
- Input background: #111216
- Border: rgba(255,255,255,0.08)
- Soft border: rgba(255,255,255,0.05)
- Primary text: #F4F4F5
- Secondary text: #A1A1AA
- Muted text: #71717A
- Disabled text: #52525B

Backgrounds may use subtle radial gradients, very low-opacity grid/dot texture, and soft depth. Avoid loud animated backgrounds, heavy glassmorphism, or bright full-page glow.

## Accent Colours

Use accent colours sparingly.

Primary accent:
- Electric violet / blue-violet
- #6D5DFB
- #7C3AED
- #8B5CF6

Secondary action accent:
- Warm orange
- #FF6A1A
- #FF7A2F

Status accents:
- Success / active: #22C55E / #34D399
- Running / progress: #3B82F6 / #2563EB
- Warning / review: #F59E0B
- Danger / urgent: #EF4444

Rule:
Never use all accent colours at once on one screen. Most screens should use dark greys, white text, and one accent colour.

## Layout System

Use a fixed left sidebar and clean content canvas.

Desktop / tablet layout:
- Left sidebar: 240–280px
- Main content: full-height scrollable workspace
- Top area: page title and simple actions
- Content: cards, panels, tables, timelines, boards, or chat surfaces

Recommended spacing:
- Page padding: 28–40px desktop
- Panel gap: 16–24px
- Card padding: 18–28px
- Section radius: 18–28px
- Small control radius: 10–14px

## Sidebar Rules

The sidebar is a main visual anchor.

Style:
- Dark raised vertical panel
- Rounded outer corners where suitable
- Subtle border
- Low-opacity inner shadow
- Grouped navigation sections
- Clean icons
- Muted inactive labels
- Clear active state

Suggested groups:

MAIN:
- Overview
- Work
- AI Team
- Reports

OPERATIONS:
- Knowledge
- Playbooks
- Automations
- Projects

TOOLS:
- Marketing
- Planner
- People
- Setup

Active nav item:
- Dark raised pill
- Subtle violet/blue glow or right-side accent edge
- White text
- Brighter icon

Inactive nav item:
- Muted grey text
- Soft icon
- No full bright background

Avoid:
- Too many glowing nav items
- Oversized icons
- Colourful icons everywhere
- Cramped spacing

## Cards and Panels

Cards should feel premium and tactile.

Default card style:
- Background: #18191C or #1A1B1F
- Border: rgba(255,255,255,0.07)
- Radius: 20–28px
- Shadow: soft black shadow, low spread
- Padding: 20–28px

Cards should use:
- Background base
- Subtle border
- Occasional inner highlight
- Optional soft glow only for active/selected states

Do not use heavy glass blur everywhere. Use it only for modals or hero-level panels.

## Typography

Use modern, readable product typography.

Preferred:
- Inter, Geist, or similar modern sans-serif

Avoid:
- Robotic mono font for main UI

Use mono only for:
- IDs
- Commands
- Commit hashes
- Tokens
- Technical metadata

Hierarchy:
- Page title: 40–56px, bold, tight tracking
- Section heading: 18–24px, semibold
- Card title: 14–18px, semibold
- Metric number: 32–52px, bold
- Body text: 14–16px
- Meta labels: 11–12px uppercase, wide letter spacing

Keep copy short and calm.

## Buttons

Buttons must look custom to Mission Control, not like default Tailwind/shadcn buttons.

Primary button:
- Orange or violet gradient
- Rounded 12–16px
- Clear label
- Optional leading icon
- Height 40–48px

Secondary button:
- Dark raised surface
- Subtle border
- White or muted text

Ghost button:
- No border unless hover
- Muted text
- Minor actions only

## Modals and Dialogs

Modals should look like compact dark command cards.

Style:
- Rounded rectangle
- Deep black panel
- Strong but soft shadow
- Large icon/status indicator when useful
- Short heading
- Short supporting text
- Clear progress or action buttons

Agent chat modal:
- Header: worker name + active status + summary button
- Body: chat thread only
- Footer: message input + send button
- Technical settings hidden behind summary

Running state:
- Title: Running task...
- Text: James is working on the request.
- Progress: subtle animated bar or pulse
- Actions: View Reports / Cancel only if safe

Completed state:
- Title: Work complete
- Action: View report
- Secondary: Continue chat

## Data Visualisation

Charts should be simple, geometric, and dark-native.

Use:
- Rounded bars
- Segmented progress bars
- Donut rings
- Minimal line charts
- Block charts / tile charts
- Subtle glow only on highlighted segment

Avoid:
- Noisy legends
- Dense axes
- Bright multi-colour chart explosions
- Default chart library styling

Charts should look like part of the product.

## Work Boards and Task Cards

Task boards should borrow from premium pipeline/task samples.

Column headers:
- Uppercase status
- Small coloured vertical bar
- Task count
- Last updated meta

Task cards:
- Dark card
- Dotted or soft internal border
- Priority ribbon or top strip
- Task title large enough to scan
- Short description
- Status pill
- Assigned worker/avatar row
- Small metadata icons

Priority colours:
- Low: green
- Normal: blue
- Review: amber
- Urgent: red
- Blocked: red/dark

## AI Worker Experience

AI Team should feel like hiring and managing workers, not configuring APIs.

Worker card:
- Portrait/avatar block
- Name
- Role
- Live status
- Last task/result
- Small action: Open

Worker status:
- Active: green dot
- Working: blue/violet pulse
- Needs review: amber
- Error: red
- Offline/ready: grey

Agent chat:
- WhatsApp/Telegram style
- Owner messages right aligned
- Worker messages left aligned
- Full response readable
- Report saved indicator below response
- View report link

Normal users should not need to understand endpoints, models, tokens, or providers.

## Reports Page

Reports should feel like an executive review console.

Structure:
- Top: Work reports and activity
- Metrics: Reports / Done / Owner Review / Blocked
- Middle: Timeline list
- Right or lower panel: Selected report detail

Timeline cards:
- Title
- Worker
- Timestamp
- Status pill
- Short response preview
- Active/selected visual state

Selected report:
- Worker
- Task number
- Review status
- Task brief
- Playbooks referenced
- Full worker response

Reports should be readable first and decorative second.

## Motion and Interaction

Motion should be subtle and premium.

Use:
- Soft hover lift
- Gentle glow on active elements
- Pulse for active worker/running task
- Smooth modal open/close
- Progress bar animation

Avoid:
- Spinning everything
- Bouncy animations
- Flashing neon
- Heavy background motion

## Copywriting Rules

Use plain English.

Use:
- Work
- AI Team
- Reports
- Playbooks
- Knowledge
- Owner review
- Work complete
- Needs attention
- Send work
- View report

Avoid:
- Execution trace
- Runtime dispatch
- Provider endpoint
- Operational schema
- Agent command bridge
- Vector memory
- Inference event

Technical terms may exist only inside hidden admin/summary panels.

## Tablet Behaviour

Tablet layout is critical.

Requirements:
- Sidebar must remain readable
- Modals must fit landscape tablet
- Chat responses must scroll inside the modal
- Send button must remain visible
- No horizontal page scroll
- Cards must stack cleanly

Primary target:
- Android tablet landscape first
- Desktop second
- Phone later

## Mission Control Design Principles

Every screen must follow these principles:

1. Dark first
2. Minimal before decorative
3. One clear primary action per screen
4. Hide technical details unless needed
5. Use real data only
6. Preserve the working AI execution path
7. Make status obvious
8. Make reports readable
9. Reduce clutter
10. Feel premium, not playful

## Implementation Rule for AI Models

Do not redesign functionality while redesigning UI.

Preserve:
- API routes
- Working James Hermes flow
- Task creation
- Activity saving
- Reports display
- Playbook injection
- Admin token behaviour
- Current successful deploy path

UI work must be visual-layer first unless explicitly approved.

## Design Target Summary

Mission Control should visually sit between:
- Linear
- Raycast
- Superhuman
- Dark finance dashboard
- Premium task operating system
- AI command centre

It should not copy any single product directly. It should become its own calm, dark, operational layer for managing AI workers.
