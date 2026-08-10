-- Reusable supplier ingestion and guarded price history.
-- This schema is intentionally isolated from public catalog pricing.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_code_not_blank check (btrim(code) <> ''),
  constraint suppliers_name_not_blank check (btrim(name) <> ''),
  constraint suppliers_tenant_code_key unique (tenant_id, code)
);

create table if not exists public.supplier_sync_runs (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  products_read integer not null default 0,
  products_created integer not null default 0,
  prices_updated integer not null default 0,
  prices_unchanged integer not null default 0,
  warnings integer not null default 0,
  errors integer not null default 0,
  anomalies integer not null default 0,
  source_summary jsonb not null default '{}'::jsonb,
  error_message text,
  constraint supplier_sync_runs_status_check check (
    status in ('running', 'completed', 'completed_with_warnings', 'failed')
  ),
  constraint supplier_sync_runs_counts_non_negative check (
    products_read >= 0 and products_created >= 0 and prices_updated >= 0
    and prices_unchanged >= 0 and warnings >= 0 and errors >= 0 and anomalies >= 0
  ),
  constraint supplier_sync_runs_finished_check check (
    (status = 'running' and finished_at is null) or (status <> 'running' and finished_at is not null)
  )
);

create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supplier_sku text not null,
  name_raw text not null,
  presentation_raw text,
  normalized_name text not null,
  normalized_presentation text,
  active boolean not null default true,
  eligibility_status text not null default 'pending_review',
  source_raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint supplier_products_sku_not_blank check (btrim(supplier_sku) <> ''),
  constraint supplier_products_name_not_blank check (btrim(name_raw) <> ''),
  constraint supplier_products_normalized_name_not_blank check (btrim(normalized_name) <> ''),
  constraint supplier_products_eligibility_status_check check (
    eligibility_status in ('safe', 'blocked', 'pending_review', 'supplier_only_cost')
  ),
  constraint supplier_products_seen_order_check check (last_seen_at >= first_seen_at),
  constraint supplier_products_supplier_sku_key unique (supplier_id, supplier_sku)
);

create table if not exists public.supplier_prices (
  id uuid primary key default gen_random_uuid(),
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  price_type text not null,
  current_price numeric(18, 4) not null,
  source_emission_date date,
  source_http_last_modified timestamptz,
  fetched_at timestamptz not null,
  synced_at timestamptz not null default now(),
  source_raw jsonb not null default '{}'::jsonb,
  constraint supplier_prices_type_check check (price_type in ('retail', 'wholesale', 'business', 'cost')),
  constraint supplier_prices_price_positive check (current_price > 0),
  constraint supplier_prices_product_type_key unique (supplier_product_id, price_type)
);

create table if not exists public.supplier_price_history (
  id uuid primary key default gen_random_uuid(),
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  price_type text not null,
  old_price numeric(18, 4) not null,
  new_price numeric(18, 4) not null,
  changed_at timestamptz not null default now(),
  sync_run_id uuid not null references public.supplier_sync_runs(id) on delete restrict,
  constraint supplier_price_history_type_check check (price_type in ('retail', 'wholesale', 'business', 'cost')),
  constraint supplier_price_history_prices_positive check (old_price > 0 and new_price > 0),
  constraint supplier_price_history_actual_change check (old_price <> new_price),
  constraint supplier_price_history_run_change_key unique (sync_run_id, supplier_product_id, price_type)
);

create table if not exists public.supplier_anomalies (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supplier_product_id uuid references public.supplier_products(id) on delete cascade,
  sync_run_id uuid not null references public.supplier_sync_runs(id) on delete restrict,
  fingerprint text not null,
  anomaly_type text not null,
  severity text not null,
  status text not null default 'open',
  price_type text,
  old_price numeric(18, 4),
  observed_price numeric(18, 4),
  message text not null,
  raw_data jsonb not null default '{}'::jsonb,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  occurrence_count integer not null default 1,
  constraint supplier_anomalies_fingerprint_not_blank check (btrim(fingerprint) <> ''),
  constraint supplier_anomalies_type_not_blank check (btrim(anomaly_type) <> ''),
  constraint supplier_anomalies_severity_check check (severity in ('info', 'warning', 'error')),
  constraint supplier_anomalies_status_check check (status in ('open', 'acknowledged', 'resolved')),
  constraint supplier_anomalies_price_type_check check (price_type is null or price_type in ('retail', 'wholesale', 'business', 'cost')),
  constraint supplier_anomalies_occurrence_positive check (occurrence_count > 0),
  constraint supplier_anomalies_supplier_fingerprint_key unique (supplier_id, fingerprint)
);

create unique index if not exists supplier_sync_runs_one_running_idx
  on public.supplier_sync_runs(supplier_id)
  where status = 'running';
create index if not exists suppliers_tenant_id_idx on public.suppliers(tenant_id);
create index if not exists supplier_sync_runs_supplier_id_idx on public.supplier_sync_runs(supplier_id);
create index if not exists supplier_sync_runs_started_at_idx on public.supplier_sync_runs(started_at desc);
create index if not exists supplier_products_supplier_id_idx on public.supplier_products(supplier_id);
create index if not exists supplier_products_eligibility_status_idx on public.supplier_products(eligibility_status);
create index if not exists supplier_products_last_seen_at_idx on public.supplier_products(last_seen_at);
create index if not exists supplier_prices_supplier_product_id_idx on public.supplier_prices(supplier_product_id);
create index if not exists supplier_price_history_supplier_product_id_changed_idx
  on public.supplier_price_history(supplier_product_id, price_type, changed_at desc);
create index if not exists supplier_price_history_sync_run_id_idx on public.supplier_price_history(sync_run_id);
create index if not exists supplier_anomalies_supplier_id_status_idx on public.supplier_anomalies(supplier_id, status);
create index if not exists supplier_anomalies_supplier_product_id_idx on public.supplier_anomalies(supplier_product_id);
create index if not exists supplier_anomalies_sync_run_id_idx on public.supplier_anomalies(sync_run_id);

drop trigger if exists set_suppliers_updated_at on public.suppliers;
create trigger set_suppliers_updated_at
before update on public.suppliers
for each row execute function public.update_updated_at_column();

alter table public.suppliers enable row level security;
alter table public.supplier_sync_runs enable row level security;
alter table public.supplier_products enable row level security;
alter table public.supplier_prices enable row level security;
alter table public.supplier_price_history enable row level security;
alter table public.supplier_anomalies enable row level security;

-- The RPCs are SECURITY INVOKER and resolve the explicit tenant before any write.
-- Keep this dependency explicit instead of relying on project-wide default grants.
grant usage on schema public to service_role;
grant select on table public.tenants to service_role;

revoke all on table public.suppliers from anon, authenticated;
revoke all on table public.supplier_sync_runs from anon, authenticated;
revoke all on table public.supplier_products from anon, authenticated;
revoke all on table public.supplier_prices from anon, authenticated;
revoke all on table public.supplier_price_history from anon, authenticated;
revoke all on table public.supplier_anomalies from anon, authenticated;
grant select, insert, update, delete on table public.suppliers to service_role;
grant select, insert, update, delete on table public.supplier_sync_runs to service_role;
grant select, insert, update, delete on table public.supplier_products to service_role;
grant select, insert, update, delete on table public.supplier_prices to service_role;
grant select, insert, update, delete on table public.supplier_price_history to service_role;
grant select, insert, update, delete on table public.supplier_anomalies to service_role;

create or replace function public.supplier_open_sync_run(
  p_tenant_slug text,
  p_supplier_code text,
  p_supplier_name text,
  p_lease_seconds integer default 1800
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_supplier_id uuid;
  v_run_id uuid;
  v_code text := lower(btrim(coalesce(p_supplier_code, '')));
begin
  if btrim(coalesce(p_tenant_slug, '')) = '' or v_code = '' or btrim(coalesce(p_supplier_name, '')) = '' then
    raise exception using errcode = '22023', message = 'SUPPLIER_SYNC_INVALID_OPEN_INPUT';
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 86400 then
    raise exception using errcode = '22023', message = 'SUPPLIER_SYNC_INVALID_LEASE';
  end if;

  select id into v_tenant_id from public.tenants where slug = p_tenant_slug;
  if not found then raise exception using errcode = 'P0002', message = 'SUPPLIER_SYNC_TENANT_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_tenant_id::text || ':' || v_code, 0));

  insert into public.suppliers (tenant_id, code, name, active)
  values (v_tenant_id, v_code, btrim(p_supplier_name), true)
  on conflict (tenant_id, code) do update set name = excluded.name, active = true
  returning id into v_supplier_id;

  update public.supplier_sync_runs set
    status = 'failed',
    finished_at = now(),
    errors = greatest(errors, 1),
    error_message = 'STALE_RUN_ABANDONED'
  where supplier_id = v_supplier_id
    and status = 'running'
    and heartbeat_at < now() - make_interval(secs => p_lease_seconds);

  if exists (select 1 from public.supplier_sync_runs where supplier_id = v_supplier_id and status = 'running') then
    raise exception using errcode = '55P03', message = 'SUPPLIER_SYNC_ALREADY_RUNNING';
  end if;
  insert into public.supplier_sync_runs (supplier_id, status, started_at, heartbeat_at)
  values (v_supplier_id, 'running', now(), now()) returning id into v_run_id;
  return jsonb_build_object('tenantId', v_tenant_id, 'supplierId', v_supplier_id, 'runId', v_run_id);
end;
$$;

revoke all on function public.supplier_open_sync_run(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.supplier_open_sync_run(text, text, text, integer) to service_role;

create or replace function public.supplier_apply_sync(p_run_id uuid, p_plan jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_supplier_id uuid;
  v_run_status text;
  v_product jsonb;
  v_price jsonb;
  v_anomaly jsonb;
  v_supplier_product_id uuid;
  v_old_price numeric(18, 4);
  v_price_exists boolean;
  v_product_exists boolean;
  v_products_created integer := 0;
  v_prices_updated integer := 0;
  v_prices_unchanged integer := 0;
  v_products_read integer := 0;
  v_sku text;
  v_plan_status text;
  v_eligibility_status text;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception using errcode = '22023', message = 'SUPPLIER_SYNC_INVALID_PLAN';
  end if;
  if coalesce((p_plan->>'canApply')::boolean, false) is not true then
    raise exception using errcode = '22023', message = 'SUPPLIER_SYNC_BLOCKED_PLAN';
  end if;

  select supplier_id, status
  into v_supplier_id, v_run_status
  from public.supplier_sync_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'SUPPLIER_SYNC_RUN_NOT_FOUND';
  end if;
  if v_run_status <> 'running' then
    raise exception using errcode = '55000', message = 'SUPPLIER_SYNC_RUN_ALREADY_CLOSED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_supplier_id::text, 0));
  v_products_read := greatest(coalesce((p_plan->>'productsRead')::integer, 0), 0);
  v_plan_status := p_plan->>'status';
  if v_plan_status not in ('completed', 'completed_with_warnings') then
    raise exception using errcode = '22023', message = 'SUPPLIER_SYNC_INVALID_STATUS';
  end if;
  if jsonb_typeof(coalesce(p_plan->'products', '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'SUPPLIER_SYNC_PRODUCTS_NOT_ARRAY';
  end if;
  if jsonb_array_length(coalesce(p_plan->'products', '[]'::jsonb)) <> v_products_read then
    raise exception using errcode = '22023', message = 'SUPPLIER_SYNC_PRODUCT_COUNT_MISMATCH';
  end if;

  for v_product in select value from jsonb_array_elements(coalesce(p_plan->'products', '[]'::jsonb)) loop
    v_sku := upper(regexp_replace(btrim(coalesce(v_product->>'supplierSku', '')), '\s+', '', 'g'));
    if v_sku = '' then
      raise exception using errcode = '22023', message = 'SUPPLIER_SYNC_EMPTY_SKU';
    end if;
    v_eligibility_status := v_product->>'eligibilityStatus';
    if v_eligibility_status is null or v_eligibility_status not in ('safe', 'blocked', 'pending_review', 'supplier_only_cost') then
      raise exception using errcode = '22023', message = 'SUPPLIER_SYNC_INVALID_ELIGIBILITY_STATUS';
    end if;
    if jsonb_typeof(coalesce(v_product->'prices', '[]'::jsonb)) <> 'array'
      or jsonb_typeof(coalesce(v_product->'candidatePrices', '[]'::jsonb)) <> 'array' then
      raise exception using errcode = '22023', message = 'SUPPLIER_SYNC_INVALID_PRICE_COLLECTION';
    end if;
    if v_eligibility_status in ('blocked', 'pending_review')
      and jsonb_array_length(coalesce(v_product->'prices', '[]'::jsonb)) > 0 then
      raise exception using errcode = '22023', message = 'SUPPLIER_SYNC_NON_PROMOTABLE_PRODUCT_HAS_CURRENT_PRICES';
    end if;
    if v_eligibility_status = 'supplier_only_cost' and exists (
      select 1
      from jsonb_array_elements(coalesce(v_product->'prices', '[]'::jsonb)) as candidate(value)
      where candidate.value->>'priceType' <> 'cost'
    ) then
      raise exception using errcode = '22023', message = 'SUPPLIER_SYNC_COST_ONLY_HAS_COMMERCIAL_PRICE';
    end if;

    select exists (
      select 1 from public.supplier_products
      where supplier_id = v_supplier_id and supplier_sku = v_sku
    ) into v_product_exists;

    insert into public.supplier_products (
      supplier_id, supplier_sku, name_raw, presentation_raw, normalized_name, normalized_presentation,
      active, eligibility_status, source_raw, first_seen_at, last_seen_at
    ) values (
      v_supplier_id,
      v_sku,
      btrim(v_product->>'nameRaw'),
      nullif(btrim(coalesce(v_product->>'presentationRaw', '')), ''),
      btrim(v_product->>'normalizedName'),
      nullif(btrim(coalesce(v_product->>'normalizedPresentation', '')), ''),
      true,
      v_eligibility_status,
      coalesce(v_product->'rawData', '{}'::jsonb) || jsonb_build_object(
        'candidatePrices', coalesce(v_product->'candidatePrices', '[]'::jsonb)
      ),
      now(),
      now()
    )
    on conflict (supplier_id, supplier_sku) do update set
      name_raw = case when coalesce((v_product->>'updateCanonicalMetadata')::boolean, false) then excluded.name_raw else public.supplier_products.name_raw end,
      presentation_raw = case when coalesce((v_product->>'updateCanonicalMetadata')::boolean, false) then excluded.presentation_raw else public.supplier_products.presentation_raw end,
      normalized_name = case when coalesce((v_product->>'updateCanonicalMetadata')::boolean, false) then excluded.normalized_name else public.supplier_products.normalized_name end,
      normalized_presentation = case when coalesce((v_product->>'updateCanonicalMetadata')::boolean, false) then excluded.normalized_presentation else public.supplier_products.normalized_presentation end,
      eligibility_status = excluded.eligibility_status,
      source_raw = excluded.source_raw,
      last_seen_at = now()
    returning id into v_supplier_product_id;

    if not v_product_exists then
      v_products_created := v_products_created + 1;
    end if;

    -- Eligibility is authoritative. A previously promotable SKU must not keep stale
    -- current prices after it is quarantined or becomes cost-only.
    if v_eligibility_status in ('blocked', 'pending_review') then
      delete from public.supplier_prices
      where supplier_product_id = v_supplier_product_id;
    elsif v_eligibility_status = 'supplier_only_cost' then
      delete from public.supplier_prices
      where supplier_product_id = v_supplier_product_id
        and price_type <> 'cost';
    end if;

    for v_price in select value from jsonb_array_elements(coalesce(v_product->'prices', '[]'::jsonb)) loop
      select current_price
      into v_old_price
      from public.supplier_prices
      where supplier_product_id = v_supplier_product_id
        and price_type = v_price->>'priceType'
      for update;
      v_price_exists := found;

      if v_price->>'action' = 'unchanged' and v_price_exists then
        update public.supplier_prices set
          source_emission_date = nullif(v_price->>'sourceEmissionDate', '')::date,
          source_http_last_modified = nullif(v_price->>'sourceHttpLastModified', '')::timestamptz,
          fetched_at = (v_price->>'fetchedAt')::timestamptz,
          synced_at = now(),
          source_raw = coalesce(v_price->'rawData', '{}'::jsonb)
        where supplier_product_id = v_supplier_product_id
          and price_type = v_price->>'priceType';
        v_prices_unchanged := v_prices_unchanged + 1;
      else
        if v_price_exists and v_old_price is distinct from (v_price->>'newPrice')::numeric then
          insert into public.supplier_price_history (
            supplier_product_id, price_type, old_price, new_price, changed_at, sync_run_id
          ) values (
            v_supplier_product_id,
            v_price->>'priceType',
            v_old_price,
            (v_price->>'newPrice')::numeric,
            now(),
            p_run_id
          );
        end if;

        insert into public.supplier_prices (
          supplier_product_id, price_type, current_price, source_emission_date, source_http_last_modified, fetched_at, synced_at, source_raw
        ) values (
          v_supplier_product_id,
          v_price->>'priceType',
          (v_price->>'newPrice')::numeric,
          nullif(v_price->>'sourceEmissionDate', '')::date,
          nullif(v_price->>'sourceHttpLastModified', '')::timestamptz,
          (v_price->>'fetchedAt')::timestamptz,
          now(),
          coalesce(v_price->'rawData', '{}'::jsonb)
        )
        on conflict (supplier_product_id, price_type) do update set
          current_price = excluded.current_price,
          source_emission_date = excluded.source_emission_date,
          source_http_last_modified = excluded.source_http_last_modified,
          fetched_at = excluded.fetched_at,
          synced_at = excluded.synced_at,
          source_raw = excluded.source_raw;

        if not v_price_exists or v_old_price is distinct from (v_price->>'newPrice')::numeric then
          v_prices_updated := v_prices_updated + 1;
        else
          v_prices_unchanged := v_prices_unchanged + 1;
        end if;
      end if;
    end loop;
  end loop;

  for v_anomaly in select value from jsonb_array_elements(coalesce(p_plan->'anomalies', '[]'::jsonb)) loop
    v_supplier_product_id := null;
    v_sku := nullif(upper(regexp_replace(btrim(coalesce(v_anomaly->>'supplierSku', '')), '\s+', '', 'g')), '');
    if v_sku is not null then
      select id into v_supplier_product_id
      from public.supplier_products
      where supplier_id = v_supplier_id and supplier_sku = v_sku;
    end if;

    insert into public.supplier_anomalies (
      supplier_id, supplier_product_id, sync_run_id, fingerprint, anomaly_type,
      severity, status, price_type, old_price, observed_price, message, raw_data
    ) values (
      v_supplier_id,
      v_supplier_product_id,
      p_run_id,
      v_anomaly->>'fingerprint',
      v_anomaly->>'type',
      v_anomaly->>'severity',
      'open',
      nullif(v_anomaly->>'priceType', ''),
      nullif(v_anomaly->>'oldPrice', '')::numeric,
      nullif(v_anomaly->>'observedPrice', '')::numeric,
      v_anomaly->>'message',
      coalesce(v_anomaly->'rawData', '{}'::jsonb)
    )
    on conflict (supplier_id, fingerprint) do update set
      supplier_product_id = excluded.supplier_product_id,
      sync_run_id = excluded.sync_run_id,
      severity = excluded.severity,
      status = 'open',
      old_price = excluded.old_price,
      observed_price = excluded.observed_price,
      message = excluded.message,
      raw_data = excluded.raw_data,
      last_detected_at = now(),
      occurrence_count = public.supplier_anomalies.occurrence_count + 1;
  end loop;

  update public.supplier_sync_runs set
    finished_at = now(),
    status = v_plan_status,
    products_read = v_products_read,
    products_created = v_products_created,
    prices_updated = v_prices_updated,
    prices_unchanged = v_prices_unchanged,
    warnings = greatest(coalesce((p_plan->>'warnings')::integer, 0), 0),
    errors = greatest(coalesce((p_plan->>'errors')::integer, 0), 0),
    anomalies = jsonb_array_length(coalesce(p_plan->'anomalies', '[]'::jsonb)),
    source_summary = coalesce(p_plan->'sourceSummary', '{}'::jsonb),
    error_message = null
  where id = p_run_id;

  return jsonb_build_object(
    'productsRead', v_products_read,
    'productsCreated', v_products_created,
    'pricesUpdated', v_prices_updated,
    'pricesUnchanged', v_prices_unchanged
  );
end;
$$;

revoke all on function public.supplier_apply_sync(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.supplier_apply_sync(uuid, jsonb) to service_role;
