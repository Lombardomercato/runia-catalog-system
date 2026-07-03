-- Runia Commerce - allow a public sales order to link an Account later.
-- Public identity and commercial snapshots remain mandatory and immutable evidence.

alter table public.sales_orders
  drop constraint if exists sales_orders_public_snapshot_check;

alter table public.sales_orders
  add constraint sales_orders_public_snapshot_check
  check (
    source <> 'public_commerce'
    or (
      source_draft_id is not null
      and btrim(source_draft_id) <> ''
      and idempotency_key is not null
      and btrim(idempotency_key) <> ''
      and btrim(currency) <> ''
      and jsonb_typeof(identity_snapshot_json) = 'object'
      and jsonb_typeof(commercial_snapshot_json) = 'object'
      and jsonb_typeof(draft_snapshot_json) = 'object'
    )
  );
