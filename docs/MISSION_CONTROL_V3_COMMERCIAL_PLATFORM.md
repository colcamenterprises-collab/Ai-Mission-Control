# Mission Control 3.0 — Commercial Platform Foundation

## Product architecture
Mission Control 3.0 is one SaaS control plane serving isolated organisations. Customli is the bootstrap organisation, not a special fork. Target hierarchy: Platform → Organisation → Businesses → Projects → Agents → Workflows → Integrations → Knowledge → Executions.

## Current foundation
Tenant-owned V3 tables cover organisation identity, memberships, plan/entitlements, branding and onboarding. Authenticated owner and service-admin requests resolve only the bootstrap Customli organisation. Arbitrary client-selected tenant switching fails closed. This is a foundation, not a claim that the legacy application is multi-tenant yet.

## Legacy tenant-boundary migration gate — INCOMPLETE
Before a second paying organisation can be provisioned, every canonical data domain must gain enforced organisation ownership and server-side query scoping. This includes tasks, task messages, projects, archives, inbox, memories and metadata/revisions/grants, agents, commands, tools/access, integrations/access, contacts, content, events, activity, work requests/transitions/instructions, approvals, audit events, execution scopes, signals, account sources/health, provisioning/runtime hosts/instances/secrets/grants, model policies/usage, attachments, workspaces and any uploaded files. Migration must be additive, backfill Customli ownership, verify row counts, then make tenant ownership non-null before commercial activation.

## RBAC and capability model
Target roles: owner, admin, operator, finance, member, viewer and service principal. Organisation membership grants UI/data visibility; agent capability policy separately governs executable actions. Protected actions remain approval-gated. Tenant membership must never imply unrestricted agent execution capability.

## Secrets
Credentials remain server-side, encrypted where supported, never returned in tenant APIs. Commercial release requires tenant ownership on vault entries, rotation/revocation workflow, audit events and a proof that one organisation cannot enumerate another organisation's secret metadata.

## Billing and metering — INCOMPLETE
Plan and entitlement boundaries exist. No billing provider is active. Required before paid GA: subscription lifecycle, trials, plan enforcement, per-organisation provider/model/agent/task usage attribution, included AI allowance, overage or hard-budget policy, failed-payment behavior and customer-visible usage.

## Backup and restore — INCOMPLETE
Required certification: encrypted automated backups, retention policy, restore to isolated environment, tenant-level export/delete, recovery-time and recovery-point targets, and a demonstrated restore test.

## Webhook security — INCOMPLETE
Raw-body HMAC verification remains a release gate. Signature checks must use the exact received request bytes, enforce timestamp/replay protection and reject invalid signatures before parsing/dispatch.

## Hostile two-tenant certification — INCOMPLETE
Create Organisation A and B. Authenticate as B and attempt to access A by guessed IDs, route parameters, headers, search, exports, files, memories, tasks, agents, execution history, cost records and credential metadata. Every access must fail. Repeat for agent/service credentials and cross-tenant webhook/idempotency keys.

## Commercial release gates
PASS: V3 tenant tables; deterministic Customli bootstrap; tenant context fail-closed for owner/service arbitrary switching; live Product Setup/readiness surface. INCOMPLETE: migration of legacy domains; multi-user SaaS authentication; RBAC enforcement across legacy routes; raw-body webhook HMAC; billing/metering; tenant-aware backup/restore; hostile two-tenant certification; privacy/export/deletion workflow; security review and incident runbook.

## Version marker
API/UI identify this foundation as Mission Control 3.0. Existing business names and operational data are not renamed.
