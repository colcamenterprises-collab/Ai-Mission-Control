#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${SBB_FINANCE_ENV_FILE:-/etc/mission-control/sbb-finance-readonly.env}"
[[ -r "$ENV_FILE" ]] || { echo '{"ok":false,"error":"SBB finance read-only connection is not configured"}' >&2; exit 2; }
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${SBB_FINANCE_DATABASE_URL:?SBB_FINANCE_DATABASE_URL missing}"

MODE="${1:-latest-shift}"
VALUE="${2:-}"

case "$MODE" in
  latest-shift)
    TARGET_WHERE="TRUE"
    TARGET_ORDER="closed_at DESC"
    ;;
  shift)
    [[ "$VALUE" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo '{"ok":false,"error":"invalid shift id"}' >&2; exit 2; }
    TARGET_WHERE="id = '$VALUE'::uuid"
    TARGET_ORDER="closed_at DESC"
    ;;
  date)
    [[ "$VALUE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo '{"ok":false,"error":"date must be YYYY-MM-DD"}' >&2; exit 2; }
    TARGET_WHERE="(opened_at AT TIME ZONE 'Asia/Bangkok')::date = '$VALUE'::date"
    TARGET_ORDER="opened_at DESC"
    ;;
  *)
    echo '{"ok":false,"error":"usage: sbb-finance-read [latest-shift|shift UUID|date YYYY-MM-DD]"}' >&2
    exit 2
    ;;
esac
psql "$SBB_FINANCE_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 <<SQL
BEGIN READ ONLY;
WITH target AS (
  SELECT * FROM pos_shifts
  WHERE status = 'closed' AND $TARGET_WHERE
  ORDER BY $TARGET_ORDER
  LIMIT 1
), paid_orders AS (
  SELECT oo.* FROM ordering_orders oo
  JOIN target s ON oo.pos_shift_id = s.id
  WHERE oo.payment_status = 'paid'
), payments AS (
  SELECT op.method,
         count(*)::int AS receipt_count,
         coalesce(sum(op.amount),0)::numeric(12,2) AS amount
  FROM ordering_payments op
  JOIN paid_orders oo ON oo.id = op.order_id
  WHERE op.status = 'confirmed'
  GROUP BY op.method
), item_totals AS (
  SELECT coalesce(sum(oi.quantity),0)::int AS units,
         count(distinct oi.order_id)::int AS orders_with_items
  FROM ordering_order_items oi
  JOIN paid_orders oo ON oo.id = oi.order_id
  WHERE coalesce(oi.is_set_component,false) = false
), refunds AS (
  SELECT count(*)::int AS refund_count,
         coalesce(sum(r.amount),0)::numeric(12,2) AS refund_total
  FROM refund_logs r
  JOIN target s ON r.shift_date = (s.opened_at AT TIME ZONE 'Asia/Bangkok')::date
)
SELECT coalesce(jsonb_pretty(jsonb_build_object(
  'ok', true,
  'source', 'SBB inbuilt POS',
  'source_tables', jsonb_build_array('pos_shifts','ordering_orders','ordering_payments','ordering_order_items','refund_logs'),
  'shift', jsonb_build_object(
    'id', s.id,
    'staff_name', s.staff_name,
    'opened_at', s.opened_at,
    'closed_at', s.closed_at,
    'shift_date_bangkok', (s.opened_at AT TIME ZONE 'Asia/Bangkok')::date,
    'starting_float', s.starting_float,
    'closing_cash', s.closing_cash,
    'cash_banked', s.cash_banked,
    'expected_cash', s.expected_cash,
    'variance', s.variance
  ),
  'sales', jsonb_build_object(
    'paid_orders', (SELECT count(*) FROM paid_orders),
    'gross_paid_total', (SELECT coalesce(sum(total),0)::numeric(12,2) FROM paid_orders),
    'item_units', i.units
  ),
  'payments', coalesce((SELECT jsonb_object_agg(method, jsonb_build_object('amount', amount, 'receipt_count', receipt_count)) FROM payments), '{}'::jsonb),
  'refunds', jsonb_build_object('count', r.refund_count, 'total', r.refund_total),
  'retrieved_at', now()
)), '{"ok":false,"error":"no matching closed POS shift"}')
FROM target s
CROSS JOIN item_totals i
CROSS JOIN refunds r;
COMMIT;
SQL
