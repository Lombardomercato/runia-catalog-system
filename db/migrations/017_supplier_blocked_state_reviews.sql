-- Human-reviewed BLOCKED states are accepted by their exact, canonical state
-- signature. A SKU alone is deliberately insufficient approval.

create table public.supplier_blocked_state_reviews (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supplier_sku text not null,
  state_signature text not null,
  state_payload jsonb not null,
  reviewed_at timestamptz not null default now(),
  reviewed_by text not null,
  unique (supplier_id, supplier_sku),
  constraint supplier_blocked_state_reviews_sku_check check (
    supplier_sku = upper(btrim(supplier_sku)) and supplier_sku <> ''
  ),
  constraint supplier_blocked_state_reviews_signature_check check (
    char_length(state_signature) = 64
    and state_signature ~ '^[0-9a-f]{64}$'
  ),
  constraint supplier_blocked_state_reviews_payload_check check (
    jsonb_typeof(state_payload) = 'object'
  ),
  constraint supplier_blocked_state_reviews_reviewer_check check (
    btrim(reviewed_by) <> ''
  )
);

alter table public.supplier_blocked_state_reviews enable row level security;

revoke all on table public.supplier_blocked_state_reviews from anon, authenticated;
grant select, insert, update on table public.supplier_blocked_state_reviews to service_role;
