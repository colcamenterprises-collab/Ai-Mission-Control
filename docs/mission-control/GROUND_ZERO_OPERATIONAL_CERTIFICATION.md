# Ground Zero Operational Certification

**Status:** CURRENT  
**Purpose:** Collapse the next aligned Mission Control operational steps into one preparation/certification surface rather than shipping one small patch at a time.

## Scope

This mega-patch covers four aligned outcomes together:

1. Verify James receives canonical company/employee context and has a configured runtime/model policy.
2. Apply Amanda's canonical SBB Financial Controller Employment Pack, report live granted systems, and keep behavioural certification separate from profile text.
3. Establish Justin's canonical SBB Operations Manager Employment Pack and operational certification contract for suppliers, ingredient/food costing, stock and theoretical usage.
4. Re-apply/verify the AI Intelligence Analyst Employment Pack, research model policy, runtime context and canonical Daily AI Intelligence Brief task.

The same surface also seeds role-aware model policies and reports factual blockers rather than manufacturing readiness.

## Guiding rule

**Scale fast, but safely.** Preparation can apply already-approved internal role/configuration policy, but cannot fabricate an employee, runtime, connector, credential, system grant or demonstrated behaviour.

## Routes

`GET /api/ground-zero/certification` — consolidated live status for James, Amanda, Justin and AI Intelligence Analyst: employee presence, runtime configuration, canonical context assembly, model policy, Amanda/Justin certification state and Analyst daily task state.  
`POST /api/ground-zero/prepare` — idempotently applies existing employee packs where employees exist, seeds role-aware model policy, syncs canonical context to managed runtime workspaces and ensures the Analyst daily task. Missing employees/access remain explicit blockers.  
`POST /api/ground-zero/live-probe` — runs short read-only prompts through each actually configured employee runtime to prove that canonical context is reaching the live worker, rather than merely existing in repository files.  
`POST /api/ground-zero/certification-evidence/:employee` — records demonstrated Amanda or Justin workflow checks after real evidence has been observed. It does not grant systems or infer access.

## Justin certification contract

Justin owns SBB operational control: supplier lists/information, ingredient purchase costs, recipe/food costing, daily stock review, estimated/theoretical usage, stock variance and operational anomaly investigation. Amanda owns sales, expenses, banking/reconciliation and finance control. Cross-domain work is collaborative and James owns routing.

Justin reaches operational READY only after live required-system access is present and demonstrated checks show he can retrieve evidence, verify costing, compare actual vs theoretical stock, investigate an anomaly, make a delegated reversible decision, report concisely and escalate correctly.

## Acceptance sequence after deployment

1. `POST /api/ground-zero/prepare`.
2. `GET /api/ground-zero/certification` and resolve only factual gaps.
3. `POST /api/ground-zero/live-probe`; all configured target runtimes must pass their role/context probe.
4. Run real Amanda and Justin domain tasks and record demonstrated certification evidence only after the evidence exists.
5. Observe an Analyst Daily AI Intelligence Brief execution from canonical Task → Work Request → specialist → James QA → Done.
6. Run one clean Ground Zero end-to-end task through the same autonomous execution loop with no owner intervention except a genuine protected action.

A green build or populated Markdown file is not operational certification. The final proof is live runtime behaviour plus the autonomous Mission Control execution loop.
