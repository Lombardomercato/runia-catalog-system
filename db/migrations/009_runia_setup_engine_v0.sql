-- Runia Setup Engine v0
-- Adds the minimum persisted settings required by Setup and an atomic,
-- service-role-only RPC for provisioning a Commerce tenant.

alter table public.tenants
  add column if not exists locale text not null default 'es-AR',
  add column if not exists feature_show_prices boolean not null default true;

alter table public.tenants
  drop constraint if exists tenants_status_check;

alter table public.tenants
  add constraint tenants_status_check
  check (status in ('setup', 'active', 'inactive', 'archived'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenants_locale_format_check'
      and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_locale_format_check
      check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$');
  end if;

  if exists (
    select 1
    from public.price_lists
    where is_default = true
    group by tenant_id
    having count(*) > 1
  ) then
    raise exception
      'Cannot enforce one default price list: an existing tenant has multiple defaults.';
  end if;
end $$;

create unique index if not exists price_lists_one_default_per_tenant_idx
  on public.price_lists(tenant_id)
  where is_default = true;

create or replace function public.setup_create_commerce_tenant(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
  v_tenant public.tenants%rowtype;
  v_tenant_id uuid;
  v_default_price_list_id uuid;
  v_controlled_brand_id uuid;
  v_price_lists jsonb;
  v_price_list_count integer;
  v_distinct_code_count integer;
  v_default_count integer;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception using errcode = '22023', message = 'SETUP_INVALID_INPUT';
  end if;

  v_slug := lower(btrim(coalesce(p_input->>'slug', '')));
  if v_slug = '' or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'SETUP_INVALID_SLUG';
  end if;

  -- Serializes retries for the same public idempotency key (the tenant slug).
  perform pg_advisory_xact_lock(hashtextextended(v_slug, 0));

  select *
  into v_tenant
  from public.tenants
  where slug = v_slug;

  if found then
    select id
    into v_controlled_brand_id
    from public.brands
    where tenant_id = v_tenant.id
      and is_controlled_placeholder = true
    order by created_at
    limit 1;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', price_list.id,
          'name', price_list.name,
          'code', price_list.code,
          'active', price_list.is_active,
          'isDefault', price_list.is_default,
          'pricingMode', price_list.pricing_mode,
          'marginPercent', price_list.margin_percent
        )
        order by price_list.is_default desc, price_list.created_at, price_list.code
      ),
      '[]'::jsonb
    )
    into v_price_lists
    from public.price_lists price_list
    where price_list.tenant_id = v_tenant.id;

    return jsonb_build_object(
      'state', 'exists',
      'tenantId', v_tenant.id,
      'name', v_tenant.name,
      'slug', v_tenant.slug,
      'status', v_tenant.status,
      'currency', v_tenant.currency,
      'locale', v_tenant.locale,
      'email', v_tenant.contact_email,
      'whatsapp', v_tenant.whatsapp_phone,
      'defaultPriceListId', v_tenant.default_price_list_id,
      'controlledBrandId', v_controlled_brand_id,
      'features', jsonb_build_object(
        'showPrices', v_tenant.feature_show_prices,
        'publicCatalog', v_tenant.feature_public_catalog,
        'orders', v_tenant.feature_orders,
        'importer', v_tenant.feature_importer,
        'multiplePriceLists', v_tenant.feature_multiple_price_lists,
        'images', v_tenant.feature_images,
        'wholesaleLogin', v_tenant.feature_wholesale_login
      ),
      'priceLists', v_price_lists
    );
  end if;

  if jsonb_typeof(p_input->'priceLists') <> 'array' then
    raise exception using errcode = '22023', message = 'SETUP_PRICE_LISTS_REQUIRED';
  end if;

  select
    count(*),
    count(distinct lower(btrim(price_list->>'code'))),
    count(*) filter (where coalesce((price_list->>'isDefault')::boolean, false))
  into v_price_list_count, v_distinct_code_count, v_default_count
  from jsonb_array_elements(p_input->'priceLists') price_list;

  if v_price_list_count < 1 or v_price_list_count > 10 then
    raise exception using errcode = '22023', message = 'SETUP_PRICE_LIST_COUNT_INVALID';
  end if;
  if v_distinct_code_count <> v_price_list_count then
    raise exception using errcode = '22023', message = 'SETUP_PRICE_LIST_CODES_DUPLICATED';
  end if;
  if v_default_count <> 1 then
    raise exception using errcode = '22023', message = 'SETUP_DEFAULT_PRICE_LIST_INVALID';
  end if;

  insert into public.tenants (
    name,
    slug,
    status,
    legal_name,
    contact_email,
    whatsapp_phone,
    logo_url,
    primary_color,
    secondary_color,
    currency,
    locale,
    minimum_order_amount,
    minimum_purchase_amount,
    feature_show_prices,
    feature_public_catalog,
    feature_orders,
    feature_wholesale_login,
    feature_multiple_price_lists,
    feature_importer,
    feature_images,
    feature_stock,
    feature_invoicing
  ) values (
    btrim(p_input->>'name'),
    v_slug,
    p_input->>'status',
    nullif(btrim(coalesce(p_input->>'legalName', '')), ''),
    nullif(btrim(coalesce(p_input->>'email', '')), ''),
    nullif(btrim(coalesce(p_input->>'whatsapp', '')), ''),
    nullif(btrim(coalesce(p_input->>'logoUrl', '')), ''),
    p_input->>'primaryColor',
    p_input->>'secondaryColor',
    p_input->>'currency',
    p_input->>'locale',
    (p_input->>'minimumOrderAmount')::numeric,
    (p_input->>'minimumPurchaseAmount')::numeric,
    (p_input #>> '{features,showPrices}')::boolean,
    (p_input #>> '{features,publicCatalog}')::boolean,
    (p_input #>> '{features,orders}')::boolean,
    (p_input #>> '{features,wholesaleLogin}')::boolean,
    (p_input #>> '{features,multiplePriceLists}')::boolean,
    (p_input #>> '{features,importer}')::boolean,
    (p_input #>> '{features,images}')::boolean,
    false,
    false
  )
  returning * into v_tenant;

  v_tenant_id := v_tenant.id;

  insert into public.price_lists (
    tenant_id,
    name,
    code,
    is_active,
    is_default,
    pricing_mode,
    margin_percent
  )
  select
    v_tenant_id,
    btrim(price_list->>'name'),
    lower(btrim(price_list->>'code')),
    (price_list->>'active')::boolean,
    (price_list->>'isDefault')::boolean,
    price_list->>'pricingMode',
    (price_list->>'marginPercent')::numeric
  from jsonb_array_elements(p_input->'priceLists') price_list;

  select id
  into v_default_price_list_id
  from public.price_lists
  where tenant_id = v_tenant_id
    and is_default = true
    and is_active = true;

  if v_default_price_list_id is null then
    raise exception using errcode = '23514', message = 'SETUP_DEFAULT_PRICE_LIST_MUST_BE_ACTIVE';
  end if;

  update public.tenants
  set default_price_list_id = v_default_price_list_id
  where id = v_tenant_id
  returning * into v_tenant;

  insert into public.brands (
    tenant_id,
    external_id,
    name,
    slug,
    price_adjustment_percent,
    is_controlled_placeholder,
    is_active
  ) values (
    v_tenant_id,
    'RUNIA-SIN-MARCA',
    'Sin marca',
    'sin-marca',
    0,
    true,
    true
  )
  returning id into v_controlled_brand_id;

  select jsonb_agg(
    jsonb_build_object(
      'id', price_list.id,
      'name', price_list.name,
      'code', price_list.code,
      'active', price_list.is_active,
      'isDefault', price_list.is_default,
      'pricingMode', price_list.pricing_mode,
      'marginPercent', price_list.margin_percent
    )
    order by price_list.is_default desc, price_list.created_at, price_list.code
  )
  into v_price_lists
  from public.price_lists price_list
  where price_list.tenant_id = v_tenant_id;

  insert into public.audit_logs (
    tenant_id,
    actor_type,
    actor_name,
    entity_type,
    entity_id,
    action,
    after_json,
    metadata_json
  ) values
  (
    v_tenant_id,
    'internal',
    'Runia Setup Engine',
    'tenant',
    v_tenant_id,
    'tenant.created',
    jsonb_build_object('slug', v_tenant.slug, 'status', v_tenant.status),
    jsonb_build_object('setupVersion', 'v0')
  ),
  (
    v_tenant_id,
    'internal',
    'Runia Setup Engine',
    'tenant',
    v_tenant_id,
    'tenant.defaults_created',
    jsonb_build_object(
      'defaultPriceListId', v_default_price_list_id,
      'controlledBrandId', v_controlled_brand_id
    ),
    jsonb_build_object('setupVersion', 'v0')
  ),
  (
    v_tenant_id,
    'internal',
    'Runia Setup Engine',
    'price_list',
    v_tenant_id,
    'price_lists.created',
    v_price_lists,
    jsonb_build_object('count', v_price_list_count, 'setupVersion', 'v0')
  ),
  (
    v_tenant_id,
    'internal',
    'Runia Setup Engine',
    'tenant_setup',
    v_tenant_id,
    'setup.completed',
    jsonb_build_object(
      'slug', v_tenant.slug,
      'status', v_tenant.status,
      'features', p_input->'features'
    ),
    jsonb_build_object('setupVersion', 'v0')
  );

  return jsonb_build_object(
    'state', 'created',
    'tenantId', v_tenant.id,
    'name', v_tenant.name,
    'slug', v_tenant.slug,
    'status', v_tenant.status,
    'currency', v_tenant.currency,
    'locale', v_tenant.locale,
    'email', v_tenant.contact_email,
    'whatsapp', v_tenant.whatsapp_phone,
    'defaultPriceListId', v_tenant.default_price_list_id,
    'controlledBrandId', v_controlled_brand_id,
    'features', p_input->'features',
    'priceLists', v_price_lists
  );
end;
$$;

revoke all on function public.setup_create_commerce_tenant(jsonb) from public;
revoke all on function public.setup_create_commerce_tenant(jsonb) from anon;
revoke all on function public.setup_create_commerce_tenant(jsonb) from authenticated;
grant execute on function public.setup_create_commerce_tenant(jsonb) to service_role;

comment on function public.setup_create_commerce_tenant(jsonb) is
  'Runia-internal atomic and idempotent-by-slug Commerce tenant provisioning.';

notify pgrst, 'reload schema';
