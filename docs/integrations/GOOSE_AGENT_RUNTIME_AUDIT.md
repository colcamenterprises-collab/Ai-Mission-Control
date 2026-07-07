# Goose agent runtime integration audit

Date: 2026-07-07

## Executive recommendation

Goose is worth supporting as a **pluggable Mission Control agent runtime**, not as a replacement for Mission Control, Hermes, Codex, Gemini, OpenCore, or future custom agents. Mission Control should remain the orchestration/control plane and treat Goose as a sandboxed executor selected per task, repo, and permission profile.

Recommended implementation posture: **documentation-first now; later add a disabled-by-default adapter** that can invoke Goose either through `goose run --output-format stream-json` for batch work or `goose acp` for long-lived session/control-plane integration. Do not install Goose globally on production, do not change Hermes, do not change auth, and do not alter existing service runtime until a separate approved patch defines host isolation, secrets handling, logs, health checks, and approval behavior.

Primary references reviewed:

- Goose project README: <https://github.com/aaif-goose/goose>
- Goose docs home: <https://goose-docs.ai/>
- Goose CLI commands: <https://goose-docs.ai/docs/guides/goose-cli-commands/>
- Goose custom distributions and integration notes: <https://github.com/aaif-goose/goose/blob/main/CUSTOM_DISTROS.md>
- Goose CLI providers: <https://goose-docs.ai/docs/guides/cli-providers/>
- Goose ACP client/server guidance: <https://goose-docs.ai/docs/guides/acp-clients/>
- Goose recipes: <https://goose-docs.ai/docs/guides/recipes/session-recipes/>
- Goose adversary/security mode: <https://goose-docs.ai/docs/guides/security/adversary-mode/>

## 1. Goose capability model

### CLI usage

Goose has a first-class CLI. Relevant commands for Mission Control are:

| Capability | Goose command shape | Mission Control implication |
| --- | --- | --- |
| Interactive session | `goose session` | Useful for developer/operator sessions, not first production adapter target. |
| Batch task execution | `goose run -t "..."`, `goose run -i instructions.md`, `goose run --recipe recipe.yaml` | Best initial integration point for one-shot task execution. |
| Structured output | `goose run --output-format json` or `stream-json` | Required for adapter log/event ingestion. |
| Provider/model override | `goose run --provider <provider> --model <model>` | Lets Mission Control select provider per agent profile. |
| Extension enablement | `--with-extension`, `--with-streamable-http-extension`, `--with-builtin` | Must be derived from explicit allowlists, never free-form user input. |
| Session listing/export/diagnostics | `goose session list/export/diagnostics` | Useful for audit capture and troubleshooting. |
| Recipe validation | `goose recipe validate` | Required before enabling shared workflows. |
| Scheduling | `goose schedule ...` | Should not be enabled initially; Mission Control should own scheduling. |
| ACP mode | `goose acp` | Strong candidate for a durable runtime protocol after batch adapter proof. |

### API/server usage

Goose exposes at least two server-style integration paths:

1. **goose-server / `goosed` REST API** for HTTP integrations. Goose documentation describes endpoints for sessions, messages, extensions, and configuration, with SSE for message streaming.
2. **ACP server over stdio** via `goose acp`, with methods such as initialize, session creation/loading, prompting, and cancellation.

Recommendation: prefer **ACP** over an always-on HTTP server for Mission Control's first non-batch integration because lifecycle can be owned by the adapter process, stdio is easier to isolate, and cancellation/status semantics are part of the protocol. Use `goosed` later only if Mission Control needs a shared remote Goose service with explicit network ACLs and authentication boundaries.

### Provider configuration

Goose supports multiple model providers, including Anthropic, OpenAI, Google, Ollama, OpenRouter, Azure, Bedrock, and other providers. It also supports ACP/CLI-style pass-through providers for tools such as Claude Code and Codex, though the docs mark older CLI providers as deprecated in favor of ACP providers.

Provider configuration can be set by environment variables and config files, with environment variables taking precedence in documented custom distribution guidance. Secrets may be stored in system keyring or a file fallback depending on configuration.

Mission Control implication: provider config must be per-runtime-profile and injected through a sanitized environment. The adapter must not reuse a production user's general `~/.config/goose` unless that config is intentionally provisioned for the specific agent identity.

### MCP extension support

Goose is deeply MCP-oriented. It can connect to MCP extensions through:

- Built-in extensions such as developer/memory/github depending on installation/configuration.
- Stdio extensions via command strings.
- Streamable HTTP extensions via URLs.
- MCP servers dynamically added to ACP sessions.

Mission Control implication: Goose could be both a consumer of Mission Control-approved MCP tools and a host/controller for external MCP servers. However, every extension must be represented as an explicit allowlisted capability with name, type, command/URL, env keys, timeout, repo/filesystem scope, and approval mode.

### Skills, recipes, and workflow model

Goose supports:

- **Recipes**: YAML workflow definitions containing prompt/instructions, extensions, parameters, and sub-recipes.
- **Sub-recipes/subagents**: reusable workflow decomposition and parallel/worker patterns.
- **Plugins/skills**: git-backed plugins stored under a user agent plugin directory.
- **Scheduled recipes**: Goose-owned cron-like automation.

Mission Control implication: recipes map well to Mission Control workflow templates, but Mission Control should own scheduling, task identity, approvals, and execution records. Goose recipe scheduling should remain disabled unless explicitly approved later.

### File/repo access model

Goose runs locally and operates in a current working directory/session context. CLI docs expose working-directory filters and `cwd` is part of ACP session creation examples. Built-in developer tools can read/write files and run commands depending on enabled tools, provider behavior, sandbox settings, and approval mode.

Mission Control implication: the adapter must set a task-specific working directory, preferably a dedicated worktree or checked-out repo path. It must never grant broad home-directory access by default. Repo assignment should be explicit and logged.

### Permission/sandbox model

Goose advertises tool permission controls, sandbox mode, prompt-injection detection, and adversary-review features. It also supports running extensions inside a Docker container with `--container <container_id>` for sessions/runs.

Mission Control implication: do not rely on Goose's internal controls alone. Mission Control should wrap Goose with OS/container-level restrictions, explicit MCP/tool allowlists, read-only defaults, and human approval gates for writes, shell commands, networked tools, production APIs, or deployment actions.

### Audit/logging model

Goose has logs, session storage, session export, and diagnostics. CLI docs describe `goose info` showing log/session locations, `goose session export` producing markdown/json/yaml, and diagnostics reports containing session messages, configuration files, and recent logs.

Mission Control implication: adapter logs should be Mission Control-owned. Goose session exports and diagnostics can be captured as attachments/artifacts, but secrets and proprietary content must be redacted before sharing outside the system.

### Headless/server operation

Goose supports headless/batch operation through `goose run`, API/server embedding through `goosed`, and ACP stdio operation through `goose acp`. It also has Desktop, but Desktop is not relevant for a production runtime adapter.

## 2. Mission Control fit

| Mission Control role | Goose fit | Notes |
| --- | --- | --- |
| Agent runtime | Strong | Use as one runtime behind a generic adapter contract. |
| Worker/executor | Strong | Best first use: child-process batch worker for bounded tasks. |
| Task assignee | Strong | Represent as an assignable agent profile such as `goose/research` or `goose/code-readonly`. |
| Repo operator | Strong but risky | Require explicit repo scope, branch/worktree isolation, write approval, and no production deploy rights by default. |
| Research agent | Strong | General-purpose, MCP-enabled, can use approved research/browser/API tools. |
| Code agent | Strong | Developer extension and repo context fit coding tasks; use read-only or workspace-write profiles. |
| MCP tool host/client | Strong | Goose is primarily an MCP client; Mission Control can provision approved MCP servers/extensions. |
| Workflow executor | Strong | Recipes are a natural mapping to Mission Control workflow templates, with Mission Control retaining scheduling and audit. |

## 3. Proposed Goose adapter design

### Adapter record

```ts
type AgentRuntimeKind = "goose" | "hermes" | "codex" | "gemini" | "opencore" | "custom";

interface AgentRuntimeAdapterConfig {
  runtimeName: "goose";
  executablePath: string;           // e.g. /opt/mission-control/runtimes/goose/bin/goose
  workingDirectory: string;         // task worktree/repo path, never arbitrary home by default
  invocationMode: "run" | "acp" | "remote-server";
  provider: {
    name: string;
    model: string;
    envSecretRefs: string[];        // references, not raw secret values
    configPath?: string;
  };
  allowedExtensions: GooseExtensionGrant[];
  permissions: RuntimePermissionProfile;
  environment: Record<string, string>; // sanitized non-secret env plus resolved secret refs at launch
  taskInputFormat: "text" | "instructions-file" | "recipe" | "acp-prompt";
  outputFormat: "json" | "stream-json" | "acp-events";
  logSinks: RuntimeLogSink[];
  healthCheck: RuntimeHealthCheck;
  timeout: {
    startupMs: number;
    idleMs: number;
    hardMs: number;
  };
  cancelBehavior: "sigint-then-sigterm" | "acp-session-cancel" | "remote-cancel-endpoint";
}
```

### Extension grant

```ts
interface GooseExtensionGrant {
  name: string;
  type: "builtin" | "stdio" | "streamable-http";
  command?: string;
  args?: string[];
  url?: string;
  envSecretRefs?: string[];
  timeoutSeconds: number;
  allowedRepos?: string[];
  allowedFilesystemRoots?: string[];
  requiresHumanApproval: boolean;
}
```

### Runtime permission profile

```ts
interface RuntimePermissionProfile {
  filesystem: "none" | "read-repo" | "write-worktree";
  shell: "disabled" | "approve" | "limited";
  network: "disabled" | "allowlisted";
  productionActions: "forbidden" | "human-approved";
  secrets: "none" | "scoped-env";
  memory: "none" | "read-scoped" | "read-write-scoped";
}
```

### Initial invocation modes

| Mode | Command/protocol | Best use | Initial recommendation |
| --- | --- | --- | --- |
| Batch child process | `goose run --output-format stream-json ...` | One task, one report, deterministic logs | Implement first. |
| ACP child process | `goose acp --with-builtin ...` | Long-lived sessions, cancel, rich events | Implement second after batch proof. |
| Remote server | `goosed` REST/SSE | Shared service or remote runtime pool | Defer until auth/network model exists. |

### Task input format

Mission Control should render a canonical task envelope:

```json
{
  "task_id": "mc-task-123",
  "agent_runtime": "goose",
  "mode": "research|code|repo|workflow",
  "repo": {
    "id": "repo-abc",
    "path": "/srv/mission-control/worktrees/repo-abc/task-123",
    "branch": "mc/goose-task-123"
  },
  "instructions": "Do the approved task only.",
  "constraints": [
    "Do not deploy.",
    "Do not modify auth.",
    "Ask for approval before writes if profile requires it."
  ],
  "expected_report": {
    "summary": true,
    "files_changed": true,
    "commands_run": true,
    "risks": true
  }
}
```

For batch mode, write this envelope to an instructions file and invoke Goose with `goose run -i <file> --output-format stream-json --max-turns <n> --provider <provider> --model <model>`. For recipes, render a validated recipe with explicit parameters and attach the task envelope as context.

### Output/report format

Mission Control should normalize Goose output into:

- `runtime_execution_id`
- `goose_session_id` if available
- event stream with timestamp, type, message, tool name, tool input metadata, approval state, and redaction state
- final report markdown
- structured summary JSON
- artifacts: session export, diagnostics, patch/diff if code work happened
- status: queued, starting, running, waiting_for_approval, succeeded, failed, canceled, timed_out

### Logs and audit

Minimum logs per execution:

- adapter config hash, not raw secrets
- executable path and version
- resolved working directory
- provider/model names
- approved extension names
- permission profile
- task envelope hash
- stdout/stderr/event stream
- cancellation/timeout events
- final status and exit code

### Health check

Minimum health check for a configured Goose runtime:

1. Verify executable exists and is executable.
2. Run `goose --version` with sanitized environment.
3. Run `goose info` in diagnostic mode only if it will not leak secrets into user-visible output.
4. Validate configured recipe files with `goose recipe validate`.
5. Confirm required MCP extension commands/URLs are allowlisted and reachable where appropriate.
6. Confirm provider secret refs resolve without printing secret values.

### Timeout/cancel behavior

- Batch mode: send SIGINT first, then SIGTERM after grace period, then SIGKILL only if necessary. Mark task as canceled/timed out and preserve partial logs.
- ACP mode: call `session/cancel`, then terminate process if it does not quiesce.
- Remote server mode: use a cancellation endpoint only after auth/network design exists.

## 4. UI model

No UI changes are part of this audit. If approved later, Goose should appear as a runtime-backed agent profile, not as the control plane.

### Team / Agents page

Show Goose agents as records such as:

| Field | Example |
| --- | --- |
| Name | Goose Research Worker |
| Runtime | Goose |
| Status | Disabled / Healthy / Running / Error |
| Provider | OpenAI / Anthropic / Ollama / configured provider |
| Model | Configured model |
| Mode | Batch / ACP / Remote |
| Permission profile | Read-only / Workspace-write / Human-approved production |
| Assigned repos | Explicit repo list |

### Agent detail page

Sections:

- Runtime configuration: executable path, version, invocation mode, health status.
- Provider configuration: provider/model and secret ref names only.
- Skills/recipes: validated recipes and plugin skills available to this Goose profile.
- Extensions/tools: built-in, stdio, and HTTP MCP extensions with allow/deny state.
- Permissions: filesystem, shell, network, production action policy, memory policy.
- Assigned repos: repo scope, branch/worktree policy, write mode.
- Memory access: none/read scoped/read-write scoped.
- Tasks: active, queued, completed, failed, canceled.
- Execution history: status, duration, token/usage metadata if available, artifacts.
- Logs: event stream, stdout/stderr, redacted diagnostics.

## 5. Security model and safeguards

Required safeguards before implementation:

1. **Never run unrestricted shell by default.** Developer/shell tooling must be disabled or approval-gated unless a profile explicitly allows it.
2. **Explicit repo permissions.** A Goose agent can operate only on repos assigned to that agent profile/task.
3. **Explicit filesystem scope.** Use task-specific worktrees/directories. Deny broad home, `/`, production config, and deployment paths.
4. **Per-agent environment variables.** Launch with a minimal environment and explicit secret refs.
5. **Secret isolation.** Do not share Hermes secrets, app auth secrets, database URLs, production tokens, or operator shell env with Goose unless explicitly granted for a task.
6. **Audit logs.** Persist every runtime launch, config hash, tool grant, approval, command/tool event, and final report.
7. **Task approval modes.** Support read-only, workspace-write with approval, and production-forbidden modes first.
8. **Human approval before production actions.** Deployments, auth changes, database writes, secret access expansion, or production service restarts must require human approval and a separate policy grant.
9. **No Goose-owned scheduling initially.** Mission Control remains the scheduler and audit authority.
10. **No global mutable config dependency.** Runtime profiles should use isolated Goose config directories or containers.
11. **Redaction.** Diagnostics and session exports may contain sensitive prompt, config, or repo data; redact before display/export.
12. **Containerization target.** Move to containers or other OS isolation before any broad write/shell capability is approved.

## 6. Deployment model

| Option | Recommendation | Rationale |
| --- | --- | --- |
| Installed globally | Not initially | Global installs create version/config ambiguity and can accidentally use operator-level config. |
| Installed per-agent | Preferred early model | Version, config, and secrets can be scoped to an agent/runtime profile. |
| systemd service | Not initially | A persistent server expands auth/network/lifecycle surface. Use only for remote pool later. |
| On demand child process | Preferred first model | Easiest to audit, cancel, timeout, and isolate per task. |
| Container later | Strongly recommended before write/shell profiles | Adds filesystem, network, process, and secret boundaries. |
| Remote runtime | Later option | Useful for dedicated agent hosts, but requires authenticated transport, network ACLs, and remote log collection. |

Recommended phased deployment:

1. **Phase 0: documentation only** (this patch).
2. **Phase 1: disabled adapter metadata**: add runtime config schema, health check stubs, and UI/API read-only exposure; no execution.
3. **Phase 2: local batch proof**: run `goose run` on non-production dev host only with read-only filesystem and no production secrets.
4. **Phase 3: ACP child process**: add richer event/cancel/session handling.
5. **Phase 4: containerized write-capable profile**: only for assigned repos/worktrees.
6. **Phase 5: remote runtime pool**: only after auth, audit, network, and secret isolation are reviewed.

## 7. Comparison against Hermes

This should not become a Goose-versus-Hermes migration. The correct design is a **generic agent runtime adapter** supporting both.

### What Goose may do better

- Broad provider choice and vendor-neutral runtime posture.
- Strong MCP ecosystem fit and built-in extension model.
- Batch, Desktop, CLI, REST, and ACP integration paths.
- Recipes/sub-recipes that map to reusable workflows.
- Good fit for exploratory research, repo analysis, code tasks, and MCP-heavy experiments.

### What Hermes may remain useful for

- Existing Mission Control operational assumptions and current agent identity.
- Any established local conventions, prompts, task flows, or production-specific behavior already built around Hermes.
- Lower integration risk for existing flows because this audit intentionally does not alter Hermes.

### Shared adapter conclusion

Both should be supported through the same generic runtime concepts:

- runtime name
- executable/endpoint
- working directory
- provider/model config
- tool/extension grants
- permission profile
- memory/repo scope
- task envelope
- event/log stream
- health/status
- cancellation/timeout
- final report/artifacts

Goose-specific logic should live behind the Goose adapter; Mission Control task assignment, permissions, approvals, audit, and UI concepts should remain runtime-agnostic.

## 8. Risks, opportunities, and next patch

### Opportunities

- Add a vendor-neutral, MCP-native runtime option without displacing existing agents.
- Use Goose recipes as reusable Mission Control workflow templates.
- Use ACP for standardized session, streaming, permissions, and cancellation semantics.
- Run different Goose profiles for research, code, repo maintenance, and workflow execution.

### Risks

- Shell/file tools can be dangerous if enabled without OS-level isolation.
- MCP extensions can exfiltrate data or perform unintended side effects if not allowlisted.
- Shared user-level Goose config/keyring can leak secrets across agents/tasks.
- Goose schedules could conflict with Mission Control scheduling/audit if enabled directly.
- Remote `goosed` service would require a separate authentication and network-hardening design.
- Diagnostics/session exports can contain sensitive prompts, code, config, and logs.

### Clear next implementation patch if approved

Add a disabled-by-default Goose runtime adapter skeleton with no production execution:

1. Add a generic `AgentRuntimeAdapter` interface and a `goose` implementation stub.
2. Add config types for runtime path, invocation mode, provider/model, allowed extensions, permissions, env secret refs, timeout, and health checks.
3. Add a read-only health check command that can run `goose --version` only when an executable path is configured on a non-production host.
4. Add tests for task-envelope rendering, extension allowlist validation, permission profile validation, and secret-redaction behavior.
5. Add docs/runbook for local-only Goose testing.
6. Do not install Goose, do not enable execution by default, do not alter Hermes/auth/service runtime.

## Final recommendation

Support Goose **later** as a first-class optional runtime behind a generic Mission Control adapter. The highest-safety path is child-process `goose run` with strict read-only defaults, explicit repo/worktree scope, isolated config/env, structured event capture, and Mission Control-owned scheduling/audit. ACP should follow once basic runtime metadata, permission profiles, and cancellation semantics are in place. Do not adopt Goose as Mission Control itself and do not make it production-active without a separate security-reviewed implementation patch.
