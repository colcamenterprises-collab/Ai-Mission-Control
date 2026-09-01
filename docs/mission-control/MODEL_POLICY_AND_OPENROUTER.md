# Model Policy & OpenRouter Routing

**Classification:** CURRENT  
**Effective:** 2026-09-02  
**Ground Zero patch:** 1.3

Mission Control keeps employee identity, permissions, Employment Pack, Knowledge, tools and task history separate from the model used for inference. Models are replaceable compute, not the employee.

## Default policy classes

- **Research / intelligence:** `openrouter/free`, free cost class. Escalation is allowed only when the free route is unavailable, a required capability is missing, or James approves stronger reasoning.
- **Marketing / routine business work:** `openrouter/auto` with low cost tier.
- **Coding:** `openrouter/auto` with medium cost tier, balancing capability and cost.
- **Finance:** `openrouter/auto` with high cost tier because reconciliation and financial reasoning require stronger reliability.
- **Orchestration / James:** `openrouter/auto` with high cost tier for cross-system decisions and supervisory QA.
- **General work:** `openrouter/auto` with low cost tier.

The policy engine stores a primary model, optional fallback, maximum cost class, escalation permission and explicit escalation conditions per employee. Role defaults seed existing employees but can be changed without recreating the employee.

## Runtime behavior

Direct OpenRouter dispatch resolves the employee policy before inference. `openrouter/auto` is constrained by the policy cost tier. `openrouter/free` is used for free research workloads. The actual model returned by OpenRouter is recorded with usage when available.

OpenClaw employees keep their isolated employee identity/workspace. A model-policy update uses OpenClaw's agent-scoped `/model <model> -a` behavior to change the configured agent default. Mission Control does not mark the runtime metadata aligned if OpenClaw rejects the synchronization.

## Usage and cost visibility

`model_usage_events` records employee, task, provider, actual model, policy class, tokens, cost when the provider returns it, success and timestamp. OpenClaw calls record the configured model and success; exact provider token/cost figures remain null unless the runtime exposes them to Mission Control.

`GET /api/model-usage?days=30` aggregates requests, failures, input/output/total tokens and cost by employee/model/policy.

## Safety and escalation

Cost policy never overrides Ground Zero execution authority. Stronger inference does not grant stronger permissions. Protected financial actions, destructive changes, credentials/security changes, material expenditure and owner judgement still follow the existing approval policy.

Model escalation should occur because the work requires it, not because an agent failed once. Ordinary retry/rework remains within James's delegation before owner escalation.

## Current external routing facts

Patch 1.3 uses stable OpenRouter router identifiers rather than pinning fast-aging individual model names. As verified during implementation, OpenRouter currently provides `openrouter/free` for zero-cost routed inference and `openrouter/auto` with cost tiers (`low`, `medium`, `high`, `xhigh`, `max`). This design lets the provider's live routing pool evolve without rebuilding Mission Control employees.
