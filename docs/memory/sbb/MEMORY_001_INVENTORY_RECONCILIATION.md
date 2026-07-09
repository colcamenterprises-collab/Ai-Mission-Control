# SBB Reporting Memory 001: Inventory Reconciliation

## Purpose
This memory defines the canonical inventory reconciliation rules used by the Smash Brothers Burgers reporting dashboard.

## Canonical operating context
- Reporting applies to the daily operations shift window in Asia/Bangkok time.
- Operational monitoring window: 5:00 PM to 3:00 AM Asia/Bangkok.
- The dashboard should treat inventory reporting as read-only unless explicit approval is given by Cameron.

## Reporting rules
- Use a single source of truth for inventory-related reporting wherever possible.
- Reconcile completed orders, cancellations, and product-level sales against the reporting window before producing summaries.
- Call out discrepancies between expected inventory movement and observed sales/order activity.
- Surface anomalies clearly, including sudden drops in order volume, store downtime, or unusual item mix changes.

## Dashboard expectations
- Present inventory reconciliation as an operational summary, not as a manual accounting workflow.
- Keep the output concise, evidence-backed, and suitable for nightly reporting.
- Avoid implying stock adjustments, refunds, or store-setting changes.

## Safety and approvals
- Never modify SBB production without explicit approval.
- Never issue refunds.
- Never alter store settings.
- Never communicate with customers.
- Never perform destructive actions.

## Notes
- This memory is intended to remain stable across reporting cycles.
- If the reporting workflow changes materially, create a new memory entry rather than rewriting the historical record.
