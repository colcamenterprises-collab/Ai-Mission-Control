# Agent Bridge Runner

## Purpose

This is the missing operational bridge between Mission Control and a real agent machine.

Mission Control can already:

1. receive a task
2. route it through the orchestrator
3. allocate it to an agent
4. queue an agent command

The bridge runner lets an agent machine poll Mission Control, receive queued commands, acknowledge them, and write them into a local inbox for the agent to act on.

## Flow

```text
Mission Control task intake
  -> orchestrator review
  -> task allocation
  -> agent command queue
  -> agent bridge ping
  -> local agent inbox file
  -> agent acts
  -> agent reports progress back
```

## File added

```text
scripts/agent-bridge-runner.mjs
```

## Required environment

```bash
export AGENT_ID="2"
export AGENT_TOKEN="paste-agent-token-here"
export MISSION_CONTROL_API_BASE="https://mission.customli.io/api"
export AGENT_WORK_DIR="/opt/data/mission-agent-inbox"
```

For a runner on the same Hostinger VPS, this can also use the local API:

```bash
export MISSION_CONTROL_API_BASE="http://127.0.0.1:4100/api"
```

## One-time test

```bash
cd /opt/apps/ai-mission-control
node scripts/agent-bridge-runner.mjs --once
```

Expected output:

```text
Mission Control agent bridge starting
API: https://mission.customli.io/api
Agent ID: 2
Inbox: /opt/data/mission-agent-inbox
Mode: once
[time] James: 1 pending command(s)
Command #5 written and acknowledged
```

## Continuous loop

```bash
cd /opt/apps/ai-mission-control
node scripts/agent-bridge-runner.mjs
```

Default polling interval is 15 seconds.

To change it:

```bash
export POLL_INTERVAL_MS="30000"
node scripts/agent-bridge-runner.mjs
```

## Output files

Each command is written as two files:

```text
agent-inbox/command-00005-2026-07-09T15-00-00-000Z.json
agent-inbox/command-00005-2026-07-09T15-00-00-000Z.md
```

The markdown file is the human/agent readable brief.

The JSON file is the structured payload for automation.

## What this does not do yet

This runner does not execute code by itself.

It creates the reliable handoff point so James, Codex, or another worker can pick up a command safely. This is intentional. Execution should be added behind an approval and safety layer.

## Next layer

The next layer is an executor that reads the inbox, checks permissions, performs safe work, then reports back to:

```text
POST /api/agent/report
```

That is the point Mission Control becomes a complete loop:

```text
task -> allocate -> deliver -> execute -> report -> remember
```
