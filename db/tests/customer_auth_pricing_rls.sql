\set ON_ERROR_STOP on
-- Run after migration 018 in a disposable/local Supabase database.
-- Fixtures, ownership reads and deliberate failures are all rolled back.

begin;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '91000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'hito2-retail@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '91000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'hito2-wholesale@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '91000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'hito2-business@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '91000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'hito2-custom@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '92000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'hito2-other@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  );

insert into public.tenants (
  id, name, slug, status, feature_wholesale_login
)
values (
  '92000000-0000-4000-8000-000000000010',
  'HITO 2 other tenant fixture',
  'hito2-other-tenant-fixture',
  'active',
  true
);

insert into public.customer_accounts (
  id,
  tenant_id,
  auth_user_id,
  name,
  email,
  whatsapp_phone,
  status,
  account_type,
  pricing_policy,
  discount_percent
)
select
  fixture.account_id,
  tenant.id,
  fixture.auth_user_id,
  fixture.name,
  fixture.email,
  '+5493510000000',
  'active',
  fixture.account_type,
  fixture.pricing_policy,
  fixture.discount_percent
from public.tenants tenant
cross join (values
  (
    'a1000000-0000-4000-8000-000000000001'::uuid,
    '91000000-0000-4000-8000-000000000001'::uuid,
    'HITO 2 Retail', 'hito2-retail@example.test',
    'RETAIL', 'RETAIL', 0::numeric
  ),
  (
    'a1000000-0000-4000-8000-000000000002'::uuid,
    '91000000-0000-4000-8000-000000000002'::uuid,
    'HITO 2 Wholesale', 'hito2-wholesale@example.test',
    'WHOLESALE', 'WHOLESALE', 0::numeric
  ),
  (
    'a1000000-0000-4000-8000-000000000003'::uuid,
    '91000000-0000-4000-8000-000000000003'::uuid,
    'HITO 2 Business', 'hito2-business@example.test',
    'BUSINESS', 'BUSINESS', 0::numeric
  ),
  (
    'a1000000-0000-4000-8000-000000000004'::uuid,
    '91000000-0000-4000-8000-000000000004'::uuid,
    'HITO 2 Retail 10', 'hito2-custom@example.test',
    'RETAIL', 'CUSTOM_DISCOUNT', 10::numeric
  )
) as fixture(
  account_id,
  auth_user_id,
  name,
  email,
  account_type,
  pricing_policy,
  discount_percent
)
where tenant.slug = 'lombardo';

insert into public.customer_accounts (
  id,
  tenant_id,
  auth_user_id,
  name,
  email,
  status,
  account_type,
  pricing_policy,
  discount_percent
)
values (
  'a2000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000010',
  '92000000-0000-4000-8000-000000000001',
  'HITO 2 other account',
  'hito2-other@example.test',
  'active',
  'RETAIL',
  'RETAIL',
  0
);

insert into public.account_contacts (
  id, tenant_id, account_id, name, email, is_primary
)
select
  'b1000000-0000-4000-8000-000000000001',
  tenant.id,
  'a1000000-0000-4000-8000-000000000001',
  'HITO 2 Retail contact',
  'hito2-retail@example.test',
  true
from public.tenants tenant
where tenant.slug = 'lombardo';

insert into public.account_addresses (
  id, tenant_id, account_id, label, address_line, city, province, is_primary
)
select
  'b2000000-0000-4000-8000-000000000001',
  tenant.id,
  'a1000000-0000-4000-8000-000000000001',
  'Principal',
  'Fixture 123',
  'Córdoba',
  'Córdoba',
  true
from public.tenants tenant
where tenant.slug = 'lombardo';

insert into public.commerce_orders (
  public_id,
  tenant_id,
  tenant_record_id,
  customer_account_id,
  customer,
  items,
  base_subtotal,
  pricing_discount_amount,
  subtotal,
  delivery_cost,
  total,
  currency,
  delivery_method,
  delivery_address,
  delivery_cost_mode,
  order_status,
  payment_status,
  payment_method,
  checkout_session_id,
  idempotency_key
)
select
  fixture.public_id,
  'lombardo',
  tenant.id,
  fixture.account_id,
  jsonb_build_object('name', fixture.customer_name, 'email', fixture.email),
  jsonb_build_array(jsonb_build_object(
    'productId', 'HITO2-RLS-SKU',
    'sku', 'HITO2-RLS-SKU',
    'name', 'HITO 2 shared SKU',
    'baseUnitPrice', fixture.base_subtotal,
    'pricingPolicy', fixture.pricing_policy,
    'discountPercent', fixture.discount_percent,
    'unitPrice', fixture.subtotal,
    'quantity', 1,
    'lineBaseTotal', fixture.base_subtotal,
    'lineDiscount', fixture.pricing_discount_amount,
    'lineTotal', fixture.subtotal
  )),
  fixture.base_subtotal,
  fixture.pricing_discount_amount,
  fixture.subtotal,
  0,
  fixture.subtotal,
  'ARS',
  'PICKUP',
  null,
  'FREE',
  'pending_payment',
  'pending',
  'whatsapp_coordination',
  fixture.checkout_session_id,
  fixture.idempotency_key
from public.tenants tenant
cross join (values
  (
    'c1000000-0000-4000-8000-000000000001'::uuid,
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'HITO 2 Retail', 'hito2-retail@example.test',
    'RETAIL', 0::numeric, 100::numeric, 0::numeric, 100::numeric,
    'hito2-retail-session', 'hito2-retail-idempotency'
  ),
  (
    'c1000000-0000-4000-8000-000000000002'::uuid,
    'a1000000-0000-4000-8000-000000000002'::uuid,
    'HITO 2 Wholesale', 'hito2-wholesale@example.test',
    'WHOLESALE', 0::numeric, 80::numeric, 0::numeric, 80::numeric,
    'hito2-wholesale-session', 'hito2-wholesale-idempotency'
  ),
  (
    'c1000000-0000-4000-8000-000000000003'::uuid,
    'a1000000-0000-4000-8000-000000000003'::uuid,
    'HITO 2 Business', 'hito2-business@example.test',
    'BUSINESS', 0::numeric, 70::numeric, 0::numeric, 70::numeric,
    'hito2-business-session', 'hito2-business-idempotency'
  ),
  (
    'c1000000-0000-4000-8000-000000000004'::uuid,
    'a1000000-0000-4000-8000-000000000004'::uuid,
    'HITO 2 Retail 10', 'hito2-custom@example.test',
    'CUSTOM_DISCOUNT', 10::numeric, 100::numeric, 10::numeric, 90::numeric,
    'hito2-custom-session', 'hito2-custom-idempotency'
  )
) as fixture(
  public_id,
  account_id,
  customer_name,
  email,
  pricing_policy,
  discount_percent,
  base_subtotal,
  pricing_discount_amount,
  subtotal,
  checkout_session_id,
  idempotency_key
)
where tenant.slug = 'lombardo';

-- Guest remains RETAIL, and the trigger resolves tenant_record_id for the
-- pre-HITO2 rolling-deploy payload.
insert into public.commerce_orders (
  public_id,
  tenant_id,
  customer,
  items,
  subtotal,
  delivery_cost,
  total,
  currency,
  delivery_method,
  delivery_address,
  delivery_cost_mode,
  order_status,
  payment_status,
  payment_method,
  checkout_session_id,
  idempotency_key
)
values (
  'c1000000-0000-4000-8000-000000000099',
  'lombardo',
  '{"name":"HITO 2 guest"}',
  '[{"productId":"HITO2-RLS-SKU","quantity":1,"unitPrice":100}]',
  100,
  0,
  100,
  'ARS',
  'PICKUP',
  null,
  'FREE',
  'pending_payment',
  'pending',
  'whatsapp_coordination',
  'hito2-guest-session',
  'hito2-guest-idempotency'
);

do $fixture_assertions$
begin
  if (
    select count(*) from public.customer_accounts
    where id in (
      'a1000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000003',
      'a1000000-0000-4000-8000-000000000004'
    )
  ) <> 4 then
    raise exception 'HITO2_TEST_FAILED: four Lombardo pricing accounts were not created';
  end if;

  if exists (
    select 1 from public.commerce_orders
    where public_id = 'c1000000-0000-4000-8000-000000000099'
      and (
        tenant_record_id is null
        or customer_account_id is not null
        or pricing_policy <> 'RETAIL'
        or discount_percent <> 0
        or base_subtotal <> 100
        or pricing_discount_amount <> 0
      )
  ) then
    raise exception 'HITO2_TEST_FAILED: guest pricing/tenant defaults are incorrect';
  end if;

  begin
    insert into public.customer_accounts (
      tenant_id, name, email, account_type, pricing_policy, discount_percent
    )
    select
      tenant.id, 'Invalid wholesale fixture', 'hito2-invalid@example.test',
      'WHOLESALE', 'RETAIL', 0
    from public.tenants tenant
    where tenant.slug = 'lombardo';
    raise exception 'HITO2_TEST_FAILED: incoherent account pricing was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.commerce_orders (
      public_id,
      tenant_id,
      tenant_record_id,
      customer_account_id,
      customer,
      items,
      base_subtotal,
      pricing_discount_amount,
      subtotal,
      delivery_cost,
      total,
      currency,
      delivery_method,
      delivery_address,
      delivery_cost_mode,
      order_status,
      payment_status,
      payment_method,
      checkout_session_id,
      idempotency_key
    )
    select
      'c2000000-0000-4000-8000-000000000001',
      'lombardo',
      tenant.id,
      'a2000000-0000-4000-8000-000000000001',
      '{}',
      '[{"productId":"HITO2-RLS-SKU","quantity":1,"unitPrice":1}]',
      1,
      0,
      1,
      0,
      1,
      'ARS',
      'PICKUP',
      null,
      'FREE',
      'pending_payment',
      'pending',
      'whatsapp_coordination',
      'hito2-cross-tenant-session',
      'hito2-cross-tenant-idempotency'
    from public.tenants tenant
    where tenant.slug = 'lombardo';
    raise exception 'HITO2_TEST_FAILED: cross-tenant customer order was accepted';
  exception when foreign_key_violation then null;
  end;
end;
$fixture_assertions$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);

do $retail_rls$
begin
  if (select count(*) from public.customer_accounts) <> 1
    or not exists (
      select 1 from public.customer_accounts
      where id = 'a1000000-0000-4000-8000-000000000001'
    ) then
    raise exception 'HITO2_TEST_FAILED: retail customer can see another account';
  end if;

  if (select count(*) from public.account_contacts) <> 1
    or (select count(*) from public.account_addresses) <> 1 then
    raise exception 'HITO2_TEST_FAILED: owned contact/address visibility is wrong';
  end if;

  if (select count(*) from public.commerce_orders) <> 1
    or not exists (
      select 1 from public.commerce_orders
      where public_id = 'c1000000-0000-4000-8000-000000000001'
    ) then
    raise exception 'HITO2_TEST_FAILED: retail customer can see another/guest order';
  end if;

  begin
    update public.customer_accounts
    set discount_percent = 5
    where id = 'a1000000-0000-4000-8000-000000000001';
    raise exception 'HITO2_TEST_FAILED: authenticated customer could write its account';
  exception when insufficient_privilege then null;
  end;
end;
$retail_rls$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '92000000-0000-4000-8000-000000000001',
  true
);

do $other_tenant_rls$
begin
  if (select count(*) from public.customer_accounts) <> 1
    or not exists (
      select 1 from public.customer_accounts
      where id = 'a2000000-0000-4000-8000-000000000001'
    ) then
    raise exception 'HITO2_TEST_FAILED: other tenant customer visibility is wrong';
  end if;

  if exists (
    select 1 from public.customer_accounts
    where id::text like 'a1000000-%'
  ) then
    raise exception 'HITO2_TEST_FAILED: tenant isolation leaked a Lombardo account';
  end if;
end;
$other_tenant_rls$;

reset role;
update public.customer_accounts
set status = 'inactive'
where id = 'a1000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);

do $inactive_rls$
begin
  if exists (select 1 from public.customer_accounts)
    or exists (select 1 from public.account_contacts)
    or exists (select 1 from public.account_addresses)
    or exists (select 1 from public.commerce_orders) then
    raise exception 'HITO2_TEST_FAILED: inactive customer retained customer/order access';
  end if;
end;
$inactive_rls$;

reset role;
set local role anon;

do $anon_closed$
begin
  begin
    perform 1 from public.customer_accounts limit 1;
    raise exception 'HITO2_TEST_FAILED: anon could read customer accounts';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.commerce_orders limit 1;
    raise exception 'HITO2_TEST_FAILED: anon could read customer orders';
  exception when insufficient_privilege then null;
  end;
end;
$anon_closed$;

reset role;
rollback;
\echo 'Runia HITO 2 customer Auth/pricing/RLS: PASS'
