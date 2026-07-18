# Signup to First Value Journey

Mission Control must become a self-serve cloud product where a non-technical business owner can sign up, answer simple questions, upload what they already have, customise the look, employ their first AI team member, and land in a useful workspace without technical setup.

## Product promise

Mission Control should feel like:

> Tell us about your business. Upload what you already have. Choose your AI team. Mission Control builds the control room for you.

The user should not feel like they are configuring software.

## Journey overview

1. Create account
2. Create business workspace
3. Tell us about the business
4. Choose what they want help with
5. Upload existing files and data
6. Add branding
7. Choose visible modules
8. Employ first AI team member
9. Invite people if needed
10. Land on the Overview dashboard

## Step 1: Create account

Goal: fast account creation with minimal friction.

Fields:

- name
- email
- password or magic link
- consent / terms

Do not ask for advanced setup here.

After account creation, route to workspace setup.

## Step 2: Create workspace

Page title:

> Let's build your business control room.

Fields:

- business name
- industry
- country
- timezone
- website, optional
- main contact email

Visual style:

- large centered card
- progress indicator
- minimal helper text
- one primary action

## Step 3: Choose business type

Use visual cards, not a dropdown-only form.

Default business types:

- Restaurant / Hospitality
- Retail
- Agency
- Education
- Real Estate
- Professional Services
- Software / Product Team
- Local Service Business
- General Business
- Custom

Each card should have a simple icon, one-line description, and recommended modules.

Example:

Restaurant / Hospitality

> Staff, tasks, daily operations, stock, marketing, and reports.

Software / Product Team

> Projects, tasks, AI team, knowledge, connected code, and planning.

## Step 4: Choose what Mission Control should help with

Use selectable cards.

Options:

- Run daily tasks
- Manage people
- Organise business knowledge
- Create marketing
- Track reports
- Plan the week
- Manage contacts
- Connect existing tools
- Employ AI team members
- Manage projects

This step controls default modules and the first dashboard layout.

## Step 5: Upload existing knowledge

Page title:

> Upload what your business already uses.

Supported file types:

- CSV
- PDF
- DOCX
- TXT
- MD
- images
- spreadsheets

Upload categories:

- Staff list
- Customer or contact list
- Product or menu list
- Sales history
- SOPs and training documents
- Brand guidelines
- Marketing material
- Reports
- Other

After upload, Mission Control should classify files and ask for confirmation before importing.

## Step 6: CSV mapping wizard

When CSV files are uploaded, do not show raw schema language first.

Ask:

> What is inside this file?

Options:

- People
- Contacts
- Products
- Sales
- Tasks
- Marketing ideas
- Custom list

Then show a simple mapping UI:

- left side: columns from file
- right side: Mission Control fields
- preview rows
- import button

The user should be able to skip mapping and save the file to Knowledge.

## Step 7: Markdown and document handling

MD files should be detected and classified as one of:

- Playbook
- SOP
- Agent instruction
- Documentation
- Knowledge article
- Technical document

Do not show `SKILL.md` as a primary concept unless the user has enabled advanced/developer mode.

## Step 8: Branding

Page title:

> Make Mission Control feel like your business.

Fields:

- logo
- business display name
- primary colour
- secondary colour
- accent colour
- light/dark preference
- email/report footer

Rules:

- no full custom CSS in early versions
- keep layout consistent
- brand colours should tint accents, charts, and selected cards only
- default theme remains premium and readable

## Step 9: Choose modules

Use plain-English module cards.

Default module labels:

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

Advanced/conditional:

- Projects
- Connected Apps
- Automations
- Billing
- Developer Tools

Each card should show:

- module name
- one-line explanation
- enabled/disabled toggle
- plan requirement where relevant

## Step 10: Employ first AI team member

This is the emotional moment. It should feel gamified and premium.

Page title:

> Employ your first AI team member.

Flow:

1. Choose a role
2. Choose a style/personality
3. Choose a name
4. Choose an avatar
5. Choose what they can access
6. Confirm hire

Suggested starter roles:

- Operations Assistant
- Admin Assistant
- Marketing Assistant
- Customer Support Assistant
- Research Assistant
- Sales Assistant
- Finance Assistant
- Project Assistant
- Build Your Own

Provider/runtime choice should be secondary. The user chooses the role first. Advanced users can later choose OpenClaw, Hermes, Codex, Gemini, Goose, or other engines from advanced settings.

## Step 11: Invite people

Optional in onboarding.

Fields:

- email
- role
- permissions preset

Plain-English permission presets:

- Owner
- Manager
- Team Member
- Viewer

## Step 12: Completion screen

Page title:

> Your control room is ready.

Show a visual summary:

- workspace created
- files uploaded
- modules enabled
- AI team member created
- next recommended actions

Primary button:

> Go to Overview

Secondary action:

> Finish setup later

## First dashboard after onboarding

The first Overview screen should be simple and visual.

Sections:

- Welcome card
- Setup progress
- Today's focus
- AI team status
- Recent uploads
- Recommended next actions
- Quick actions

Example quick actions:

- Add a task
- Upload a file
- Employ another AI team member
- Invite someone
- Create a playbook
- Connect an app

## Free tier onboarding

Free users should still feel the premium product.

Free tier may limit:

- users
- storage
- AI actions
- agents
- uploads
- modules

But the UX must not feel cheap. Locked features should be shown as premium upgrade cards, not broken or hidden errors.

## First value target

Within 10 minutes of signup, a business owner should have:

- a branded workspace
- at least one uploaded business file
- one AI team member
- a useful Overview dashboard
- one recommended next action

## Final principle

The onboarding should not explain Mission Control. It should let the user build their business control room step by step and see progress visually.
