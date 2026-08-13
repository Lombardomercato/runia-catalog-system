-- Runia Catalog System - core/legacy Data API hardening
--
-- Consumer inventory: docs/RUNIA_RLS_CONSUMER_INVENTORY.md
-- Browser clients do not access these tables directly. Current Runia and
-- Lombardo consumers cross a server-only service_role boundary.

do $$
declare
  table_name text;
  closed_tables constant text[] := array[
    'tenants',
    'categories',
    'brands',
    'products',
    'price_lists',
    'product_prices',
    'product_images',
    'customer_accounts',
    'orders',
    'order_items',
    'import_batches',
    'import_rows'
  ];
begin
  foreach table_name in array closed_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'CORE_RLS_TABLE_MISSING: public.%', table_name;
    end if;

    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);

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

-- Rebuild service_role grants from the verified runtime inventory instead of
-- retaining the broad grants inherited from the original Data API defaults.
revoke all on table
  public.tenants,
  public.categories,
  public.brands,
  public.products,
  public.price_lists,
  public.product_prices,
  public.product_images,
  public.customer_accounts,
  public.orders,
  public.order_items,
  public.import_batches,
  public.import_rows
from service_role;

grant select, insert, update, delete on table
  public.tenants,
  public.customer_accounts
to service_role;

grant select, insert, update on table
  public.categories,
  public.brands,
  public.products,
  public.price_lists,
  public.product_prices,
  public.import_batches,
  public.import_rows
to service_role;

grant select on table public.orders to service_role;

-- product_images and order_items have no current runtime consumer. They remain
-- closed until a demonstrated server-side use case adds a new explicit grant.

alter function public.update_updated_at_column() set search_path = '';

comment on function public.update_updated_at_column() is
  'Generic updated_at trigger with an immutable empty search_path.';
