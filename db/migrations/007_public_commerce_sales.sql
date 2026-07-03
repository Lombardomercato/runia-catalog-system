-- Runia Commerce - public commerce sales persistence
-- Adds immutable public snapshots and one transactional, idempotent write boundary.

alter table public.sales_orders
  alter column account_id drop not null;

alter table public.sales_orders
  add column if not exists source text not null default 'admin',
  add column if not exists source_draft_id text,
  add column if not exists idempotency_key text,
  add column if not exists currency text not null default 'ARS',
  add column if not exists identity_snapshot_json jsonb not null default '{}'::jsonb,
  add column if not exists commercial_snapshot_json jsonb not null default '{}'::jsonb,
  add column if not exists draft_snapshot_json jsonb;

alter table public.sales_order_items
  add column if not exists currency_snapshot text not null default 'ARS',
  add column if not exists product_snapshot_json jsonb not null default '{}'::jsonb;

alter table public.sales_orders
  drop constraint if exists sales_orders_source_check;

alter table public.sales_orders
  add constraint sales_orders_source_check
  check (source in ('admin', 'public_commerce'));

alter table public.sales_orders
  drop constraint if exists sales_orders_public_snapshot_check;

alter table public.sales_orders
  add constraint sales_orders_public_snapshot_check
  check (
    source <> 'public_commerce'
    or (
      account_id is null
      and source_draft_id is not null
      and btrim(source_draft_id) <> ''
      and idempotency_key is not null
      and btrim(idempotency_key) <> ''
      and btrim(currency) <> ''
      and jsonb_typeof(identity_snapshot_json) = 'object'
      and jsonb_typeof(commercial_snapshot_json) = 'object'
      and jsonb_typeof(draft_snapshot_json) = 'object'
    )
  );

alter table public.sales_order_items
  drop constraint if exists sales_order_items_currency_snapshot_not_blank;

alter table public.sales_order_items
  add constraint sales_order_items_currency_snapshot_not_blank
  check (btrim(currency_snapshot) <> '');

create unique index if not exists sales_orders_tenant_source_draft_key
  on public.sales_orders(tenant_id, source_draft_id)
  where source_draft_id is not null;

create unique index if not exists sales_orders_tenant_idempotency_key
  on public.sales_orders(tenant_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists sales_orders_source_idx on public.sales_orders(source);

create or replace function public.create_public_sales_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := nullif(p_payload->>'tenantId', '')::uuid;
  v_draft_id text := btrim(coalesce(p_payload->>'sourceDraftId', ''));
  v_idempotency_key text := btrim(coalesce(p_payload->>'idempotencyKey', ''));
  v_price_list_id uuid := nullif(p_payload#>>'{commercial,priceListId}', '')::uuid;
  v_currency text := upper(btrim(coalesce(p_payload#>>'{commercial,currency}', '')));
  v_subtotal numeric := nullif(p_payload#>>'{subtotal,amount}', '')::numeric;
  v_discount numeric := nullif(p_payload#>>'{discount,amount}', '')::numeric;
  v_total numeric := nullif(p_payload#>>'{total,amount}', '')::numeric;
  v_order_id uuid;
  v_existing_draft text;
  v_item jsonb;
  v_product record;
  v_items_subtotal numeric := 0;
  v_created_at timestamptz;
  v_updated_at timestamptz;
begin
  if v_tenant_id is null or v_draft_id = '' or v_idempotency_key = '' then
    raise exception 'INVALID_PUBLIC_ORDER_CONTEXT';
  end if;

  select so.id, so.created_at, so.updated_at
    into v_order_id, v_created_at, v_updated_at
  from public.sales_orders so
  where so.tenant_id = v_tenant_id
    and so.source_draft_id = v_draft_id;

  if v_order_id is not null then
    return jsonb_build_object(
      'created', false,
      'id', v_order_id,
      'createdAt', v_created_at,
      'updatedAt', v_updated_at
    );
  end if;

  select so.source_draft_id
    into v_existing_draft
  from public.sales_orders so
  where so.tenant_id = v_tenant_id
    and so.idempotency_key = v_idempotency_key;

  if v_existing_draft is not null and v_existing_draft <> v_draft_id then
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  if not exists (
    select 1 from public.tenants t
    where t.id = v_tenant_id and t.status = 'active'
  ) then
    raise exception 'TENANT_INACTIVE_OR_NOT_FOUND';
  end if;

  if v_price_list_id is null or not exists (
    select 1 from public.price_lists pl
    where pl.id = v_price_list_id
      and pl.tenant_id = v_tenant_id
      and pl.is_active = true
  ) then
    raise exception 'PUBLIC_PRICE_LIST_INVALID';
  end if;

  if v_currency !~ '^[A-Z]{3}$'
    or v_subtotal is null
    or v_discount is null
    or v_total is null
    or v_subtotal < 0
    or v_discount < 0
    or v_total <= 0
    or v_total <> v_subtotal - v_discount then
    raise exception 'PUBLIC_ORDER_TOTALS_INVALID';
  end if;

  if btrim(coalesce(p_payload#>>'{identity,name}', '')) = ''
    or btrim(coalesce(p_payload#>>'{identity,whatsapp}', '')) = '' then
    raise exception 'PUBLIC_ORDER_IDENTITY_INVALID';
  end if;

  if jsonb_typeof(p_payload->'items') <> 'array'
    or jsonb_array_length(p_payload->'items') = 0 then
    raise exception 'PUBLIC_ORDER_ITEMS_REQUIRED';
  end if;

  for v_item in select value from jsonb_array_elements(p_payload->'items')
  loop
    if nullif(v_item->>'productId', '') is null
      or btrim(coalesce(v_item->>'sku', '')) = ''
      or btrim(coalesce(v_item->>'name', '')) = ''
      or coalesce((v_item->>'quantity')::numeric, 0) <= 0
      or coalesce((v_item#>>'{unitPrice,amount}')::numeric, -1) < 0
      or coalesce((v_item#>>'{subtotal,amount}')::numeric, -1) < 0
      or upper(coalesce(v_item#>>'{unitPrice,currency}', '')) <> v_currency
      or upper(coalesce(v_item#>>'{subtotal,currency}', '')) <> v_currency
      or (v_item#>>'{subtotal,amount}')::numeric <>
        (v_item#>>'{unitPrice,amount}')::numeric * (v_item->>'quantity')::numeric then
      raise exception 'PUBLIC_ORDER_ITEM_INVALID';
    end if;

    select
      p.sku,
      p.name,
      p.variant,
      pp.price,
      upper(pp.currency) as currency
    into v_product
    from public.products p
    join public.product_prices pp
      on pp.product_id = p.id
      and pp.price_list_id = v_price_list_id
      and pp.tenant_id = v_tenant_id
    where p.id = (v_item->>'productId')::uuid
      and p.tenant_id = v_tenant_id
      and p.is_active = true;

    if not found
      or v_product.sku <> v_item->>'sku'
      or v_product.name <> v_item->>'name'
      or v_product.variant is distinct from nullif(v_item->>'variant', '')
      or v_product.price <> (v_item#>>'{unitPrice,amount}')::numeric
      or v_product.currency <> v_currency then
      raise exception 'PUBLIC_ORDER_PRODUCT_SNAPSHOT_INVALID';
    end if;

    v_items_subtotal := v_items_subtotal + (v_item#>>'{subtotal,amount}')::numeric;
  end loop;

  if v_items_subtotal <> v_subtotal then
    raise exception 'PUBLIC_ORDER_SUBTOTAL_INVALID';
  end if;

  insert into public.sales_orders (
    tenant_id,
    account_id,
    status,
    price_list_id,
    subtotal,
    discount,
    total,
    notes,
    metadata_json,
    source,
    source_draft_id,
    idempotency_key,
    currency,
    identity_snapshot_json,
    commercial_snapshot_json,
    draft_snapshot_json
  ) values (
    v_tenant_id,
    null,
    'pending',
    v_price_list_id,
    v_subtotal,
    v_discount,
    v_total,
    nullif(p_payload->>'notes', ''),
    jsonb_build_object(
      'source', 'public_commerce',
      'identity_snapshot', p_payload->'identity',
      'commercial_snapshot', p_payload->'commercial',
      'item_order_skus', (
        select jsonb_agg(item->>'sku') from jsonb_array_elements(p_payload->'items') item
      )
    ),
    'public_commerce',
    v_draft_id,
    v_idempotency_key,
    v_currency,
    p_payload->'identity',
    p_payload->'commercial',
    p_payload->'draftSnapshot'
  )
  on conflict (tenant_id, source_draft_id) where source_draft_id is not null
  do nothing
  returning id, created_at, updated_at
    into v_order_id, v_created_at, v_updated_at;

  if v_order_id is null then
    select so.id, so.created_at, so.updated_at
      into v_order_id, v_created_at, v_updated_at
    from public.sales_orders so
    where so.tenant_id = v_tenant_id
      and so.source_draft_id = v_draft_id;

    return jsonb_build_object(
      'created', false,
      'id', v_order_id,
      'createdAt', v_created_at,
      'updatedAt', v_updated_at
    );
  end if;

  insert into public.sales_order_items (
    tenant_id,
    order_id,
    product_id,
    sku_snapshot,
    product_name_snapshot,
    variant_snapshot,
    unit_price_snapshot,
    quantity,
    subtotal,
    currency_snapshot,
    product_snapshot_json
  )
  select
    v_tenant_id,
    v_order_id,
    (item->>'productId')::uuid,
    item->>'sku',
    item->>'name',
    nullif(item->>'variant', ''),
    (item#>>'{unitPrice,amount}')::numeric,
    (item->>'quantity')::numeric,
    (item#>>'{subtotal,amount}')::numeric,
    v_currency,
    jsonb_build_object(
      'productId', item->>'productId',
      'sku', item->>'sku',
      'name', item->>'name',
      'variant', item->'variant',
      'line', item->'line',
      'brandName', item->'brandName',
      'categoryName', item->'categoryName'
    )
  from jsonb_array_elements(p_payload->'items') item;

  insert into public.audit_logs (
    tenant_id,
    actor_type,
    actor_id,
    actor_name,
    entity_type,
    entity_id,
    action,
    after_json,
    metadata_json,
    created_at
  ) values
  (
    v_tenant_id,
    'anonymous',
    null,
    p_payload#>>'{identity,name}',
    'draft_order',
    null,
    'draft_confirmed',
    p_payload->'draftSnapshot',
    jsonb_build_object('draft_id', v_draft_id, 'sales_order_id', v_order_id),
    now()
  ),
  (
    v_tenant_id,
    'anonymous',
    null,
    p_payload#>>'{identity,name}',
    'sales_order',
    v_order_id,
    'sales_order_created',
    jsonb_build_object(
      'identity', p_payload->'identity',
      'commercial', p_payload->'commercial',
      'subtotal', p_payload->'subtotal',
      'discount', p_payload->'discount',
      'total', p_payload->'total'
    ),
    jsonb_build_object('draft_id', v_draft_id),
    now()
  ),
  (
    v_tenant_id,
    'anonymous',
    null,
    p_payload#>>'{identity,name}',
    'sales_order',
    v_order_id,
    'created_from_public_commerce',
    null,
    jsonb_build_object(
      'draft_id', v_draft_id,
      'idempotency_key', v_idempotency_key,
      'channel', 'public_commerce'
    ),
    now()
  );

  return jsonb_build_object(
    'created', true,
    'id', v_order_id,
    'createdAt', v_created_at,
    'updatedAt', v_updated_at
  );
end;
$$;

revoke all on function public.create_public_sales_order(jsonb) from public;
revoke all on function public.create_public_sales_order(jsonb) from anon;
revoke all on function public.create_public_sales_order(jsonb) from authenticated;
grant execute on function public.create_public_sales_order(jsonb) to service_role;
