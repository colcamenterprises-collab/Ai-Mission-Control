# Mission Control Agent Operating Layer Audit

Mission Control is intended to be the central place where a business creates, connects, routes work to, supervises, and reports on AI workers across providers such as Claude, OpenAI, Gemini, Hermes, Clawbot, Goose, Codex, and future custom workers.

This document records the product and technical direction for making Mission Control operational rather than a visual shell.

## Current issue

The system previously displayed hardcoded placeholder AI agents and routed work toward those placeholders. That is not acceptable for production.

Live product rule:

- No fake agents.
- No fake work.
- No fake reports.
- No fake success.
- The AI Team must show only real agents that exist in the database.
- The orchestrator must only queue external work for a real connected agent.

## What top-tier agent systems are doing

Current leading agent-control systems separate these concepts:

1. Agent identity
   - name
   - role
   - model/provider/runtime
   - status
   - access scope

2. Tools and integrations
   - tools are explicit capabilities
   - agents should not get every tool by default
   - access must be granted per agent

3. Skills/playbooks
   - reusable task instructions
   - loaded only when relevant
   - paired with tools so the agent knows how to use them

4. Secrets and credentials
   - never exposed to the normal UI
   - available only through authenticated agent routes
   - logged when requested

5. Orchestration
   - receives work
   - checks available connected agents
   - checks required access
   - queues commands
   - records activity
   - tracks output

6. Reporting and traceability
   - commands
   - acknowledgements
   - task updates
   - agent reports
   - work logs

## Skills vs tools

Skills are not the same as tools.

A tool gives an agent access to a system, such as an API, CRM, repo, file store, or business app.

A skill tells the agent how to do a type of work correctly.

Example:

- Tool: Gmail API
- Skill: customer follow-up workflow

Mission Control needs both.

## Minimum viable operating layer

The bare minimum real operating layer is:

1. Real agent registry
   - only database agents are shown
   - no hardcoded fake people
   - agent must be connected before work leaves Mission Control

2. Agent token
   - Mission Control can mint an inbound bearer token for each agent
   - agent uses token to ping, collect work, report progress, and request tools

3. Work intake
   - operator adds work
   - orchestrator checks real connected workers
   - if no worker exists, task stays unassigned
   - if worker exists, task is queued as ready

4. Command queue
   - task command is stored server-side
   - local/firewalled workers can pull by ping
   - hosted workers can also receive HTTP dispatch

5. Tools/secrets vault
   - UI stores masked credentials
   - authenticated agent route returns assigned credentials only
   - every credential request is audit logged

6. Skills/playbooks
   - local SKILL.md files are scanned
   - agents can list/read skills with bearer token
   - assigned skills are included in command context

7. Reports
   - agent sends activity, completion, or memory back to Mission Control
   - task state and work logs are updated

## Patch direction applied

The first real operating-layer patch does this:

- removes hardcoded fake operational agents from the live API
- removes fake AI Team cards from the frontend
- keeps AI Team empty until real agents exist
- changes the empty state to employ/connect a real AI worker
- changes orchestrator intake to route only to real connected agents
- keeps work unassigned if no connected worker exists
- uses valid task and agent statuses only
- expands core local orchestration and coding SKILL.md files

## Next implementation steps

1. Add provider connection presets
   - Claude
   - OpenAI
   - Gemini
   - Hermes
   - Codex
   - Goose
   - Custom HTTP worker

2. Add skill assignment UI
   - select skills/playbooks per agent
   - no hardcoded skill mapping

3. Add access check before route
   - work requires tool X
   - agent lacks tool X
   - task becomes blocked with clear setup step

4. Add agent run history
   - commands sent
   - pings
   - acknowledgements
   - reports
   - tool requests

5. Add plain-English reports
   - what was done
   - what is blocked
   - what needs approval
   - what runs next

## Final product principle

Mission Control should feel simple to a business owner, but the operating layer underneath must be strict:

- real agents only
- explicit access only
- logged tool use
- visible work status
- no fake progress
