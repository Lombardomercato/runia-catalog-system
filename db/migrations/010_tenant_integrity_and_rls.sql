-- Runia Catalog System - tenant integrity and server-only RLS baseline
--
-- This migration is additive. It deliberately aborts before adding constraints
-- when existing rows contain cross-tenant references. No RB data is rewritten.
--
-- The application currently accesses Supabase through its server-side
-- service-role client. service_role bypasses RLS; therefore application queries
-- must remain tenant-scoped. RLS below prevents accidental direct access through
-- anon/authenticated keys, but it is not a substitute for server-side scoping.

do $$
declare
  violation text;
begin
  select check_name into violation
  from (
    select 'products.category_id' as check_name
    from public.products child
    join public.categories parent on parent.id = child.category_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'products.brand_id' as check_name
    from public.products child
    join public.brands parent on parent.id = child.brand_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'product_prices.product_id' as check_name
    from public.product_prices child
    join public.products parent on parent.id = child.product_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'product_prices.price_list_id' as check_name
    from public.product_prices child
    join public.price_lists parent on parent.id = child.price_list_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'product_images.product_id' as check_name
    from public.product_images child
    join public.products parent on parent.id = child.product_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'customer_accounts.price_list_id' as check_name
    from public.customer_accounts child
    join public.price_lists parent on parent.id = child.price_list_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'orders.customer_account_id' as check_name
    from public.orders child
    join public.customer_accounts parent on parent.id = child.customer_account_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'orders.price_list_id' as check_name
    from public.orders child
    join public.price_lists parent on parent.id = child.price_list_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'order_items.order_id' as check_name
    from public.order_items child
    join public.orders parent on parent.id = child.order_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'order_items.product_id' as check_name
    from public.order_items child
    join public.products parent on parent.id = child.product_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'import_rows.batch_id' as check_name
    from public.import_rows child
    join public.import_batches parent on parent.id = child.batch_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'account_contacts.account_id' as check_name
    from public.account_contacts child
    join public.customer_accounts parent on parent.id = child.account_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'account_addresses.account_id' as check_name
    from public.account_addresses child
    join public.customer_accounts parent on parent.id = child.account_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'sales_orders.account_id' as check_name
    from public.sales_orders child
    join public.customer_accounts parent on parent.id = child.account_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'sales_orders.price_list_id' as check_name
    from public.sales_orders child
    join public.price_lists parent on parent.id = child.price_list_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'sales_order_items.order_id' as check_name
    from public.sales_order_items child
    join public.sales_orders parent on parent.id = child.order_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'sales_order_items.product_id' as check_name
    from public.sales_order_items child
    join public.products parent on parent.id = child.product_id
    where parent.tenant_id <> child.tenant_id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;

  select check_name into violation
  from (
    select 'tenants.default_price_list_id' as check_name
    from public.tenants child
    join public.price_lists parent on parent.id = child.default_price_list_id
    where parent.tenant_id <> child.id
    limit 1
  ) checks;
  if violation is not null then raise exception 'TENANT_INTEGRITY_VIOLATION: %', violation; end if;
end $$;

-- Composite parent keys. The existing UUID primary keys remain unchanged.
alter table public.categories add constraint categories_tenant_id_id_key unique (tenant_id, id);
alter table public.brands add constraint brands_tenant_id_id_key unique (tenant_id, id);
alter table public.products add constraint products_tenant_id_id_key unique (tenant_id, id);
alter table public.price_lists add constraint price_lists_tenant_id_id_key unique (tenant_id, id);
alter table public.product_prices add constraint product_prices_tenant_id_id_key unique (tenant_id, id);
alter table public.product_images add constraint product_images_tenant_id_id_key unique (tenant_id, id);
alter table public.customer_accounts add constraint customer_accounts_tenant_id_id_key unique (tenant_id, id);
alter table public.orders add constraint orders_tenant_id_id_key unique (tenant_id, id);
alter table public.import_batches add constraint import_batches_tenant_id_id_key unique (tenant_id, id);
alter table public.sales_orders add constraint sales_orders_tenant_id_id_key unique (tenant_id, id);

-- Tenant-aware foreign keys. Existing single-column foreign keys are retained for
-- delete behavior and compatibility; these constraints add the isolation invariant.
alter table public.products
  add constraint products_tenant_category_fk foreign key (tenant_id, category_id)
  references public.categories (tenant_id, id);
alter table public.products
  add constraint products_tenant_brand_fk foreign key (tenant_id, brand_id)
  references public.brands (tenant_id, id);

alter table public.product_prices
  add constraint product_prices_tenant_product_fk foreign key (tenant_id, product_id)
  references public.products (tenant_id, id) on delete cascade;
alter table public.product_prices
  add constraint product_prices_tenant_price_list_fk foreign key (tenant_id, price_list_id)
  references public.price_lists (tenant_id, id);

alter table public.product_images
  add constraint product_images_tenant_product_fk foreign key (tenant_id, product_id)
  references public.products (tenant_id, id) on delete cascade;

alter table public.customer_accounts
  add constraint customer_accounts_tenant_price_list_fk foreign key (tenant_id, price_list_id)
  references public.price_lists (tenant_id, id);

alter table public.orders
  add constraint orders_tenant_account_fk foreign key (tenant_id, customer_account_id)
  references public.customer_accounts (tenant_id, id);
alter table public.orders
  add constraint orders_tenant_price_list_fk foreign key (tenant_id, price_list_id)
  references public.price_lists (tenant_id, id);

alter table public.order_items
  add constraint order_items_tenant_order_fk foreign key (tenant_id, order_id)
  references public.orders (tenant_id, id) on delete cascade;
alter table public.order_items
  add constraint order_items_tenant_product_fk foreign key (tenant_id, product_id)
  references public.products (tenant_id, id);

alter table public.import_rows
  add constraint import_rows_tenant_batch_fk foreign key (tenant_id, batch_id)
  references public.import_batches (tenant_id, id) on delete cascade;

alter table public.account_contacts
  add constraint account_contacts_tenant_account_fk foreign key (tenant_id, account_id)
  references public.customer_accounts (tenant_id, id) on delete cascade;
alter table public.account_addresses
  add constraint account_addresses_tenant_account_fk foreign key (tenant_id, account_id)
  references public.customer_accounts (tenant_id, id) on delete cascade;

alter table public.sales_orders
  add constraint sales_orders_tenant_account_fk foreign key (tenant_id, account_id)
  references public.customer_accounts (tenant_id, id);
alter table public.sales_orders
  add constraint sales_orders_tenant_price_list_fk foreign key (tenant_id, price_list_id)
  references public.price_lists (tenant_id, id);

alter table public.sales_order_items
  add constraint sales_order_items_tenant_order_fk foreign key (tenant_id, order_id)
  references public.sales_orders (tenant_id, id) on delete cascade;
alter table public.sales_order_items
  add constraint sales_order_items_tenant_product_fk foreign key (tenant_id, product_id)
  references public.products (tenant_id, id) on delete set null;

alter table public.tenants
  add constraint tenants_default_price_list_tenant_fk foreign key (id, default_price_list_id)
  references public.price_lists (tenant_id, id);

-- Direct table access is intentionally closed. Public catalog and checkout remain
-- server-side and continue to use the service-role boundary.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenants', 'categories', 'brands', 'products', 'price_lists',
    'product_prices', 'product_images', 'customer_accounts', 'orders',
    'order_items', 'import_batches', 'import_rows', 'audit_logs',
    'account_contacts', 'account_addresses', 'sales_orders',
    'sales_order_items'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('drop policy if exists server_only_deny_anon on public.%I', table_name);
    execute format(
      'create policy server_only_deny_anon on public.%I for all to anon using (false) with check (false)',
      table_name
    );
    execute format('drop policy if exists server_only_deny_authenticated on public.%I', table_name);
    execute format(
      'create policy server_only_deny_authenticated on public.%I for all to authenticated using (false) with check (false)',
      table_name
    );
  end loop;
end $$;

comment on policy server_only_deny_anon on public.products is
  'Public catalog access is mediated by the server-side Commerce SDK; direct anon access is denied.';
comment on policy server_only_deny_authenticated on public.products is
  'Temporary baseline until tenant memberships and authenticated tenant policies exist.';
