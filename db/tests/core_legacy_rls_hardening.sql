\set ON_ERROR_STOP on
begin transaction read only;

do $$
declare
  table_name text;
  closed_tables constant text[] := array[
    'tenants', 'categories', 'brands', 'products', 'price_lists',
    'product_prices', 'product_images', 'customer_accounts', 'orders',
    'order_items', 'import_batches', 'import_rows'
  ];
begin
  foreach table_name in array closed_tables loop
    if not (select relrowsecurity from pg_class where oid = to_regclass(format('public.%I', table_name))) then
      raise exception 'RLS disabled on public.%', table_name;
    end if;
    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
      or has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
      or has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
      or has_table_privilege('anon', format('public.%I', table_name), 'DELETE') then
      raise exception 'anon can access public.%', table_name;
    end if;
    if has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') then
      raise exception 'authenticated can access public.%', table_name;
    end if;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = table_name
        and policyname in ('server_only_deny_anon', 'server_only_deny_authenticated')
    ) then
      raise exception 'missing closed-surface policies on public.%', table_name;
    end if;
  end loop;

  if not has_table_privilege('service_role', 'public.tenants', 'SELECT') then
    raise exception 'service_role cannot resolve tenants';
  end if;
  if not has_table_privilege('service_role', 'public.products', 'SELECT')
    or not has_table_privilege('service_role', 'public.products', 'INSERT')
    or not has_table_privilege('service_role', 'public.products', 'UPDATE') then
    raise exception 'service_role lacks catalog access';
  end if;
  if has_table_privilege('service_role', 'public.product_images', 'SELECT')
    or has_table_privilege('service_role', 'public.product_images', 'INSERT')
    or has_table_privilege('service_role', 'public.product_images', 'UPDATE')
    or has_table_privilege('service_role', 'public.product_images', 'DELETE') then
    raise exception 'service_role has unneeded product_images access';
  end if;
  if has_table_privilege('service_role', 'public.order_items', 'SELECT')
    or has_table_privilege('service_role', 'public.order_items', 'INSERT')
    or has_table_privilege('service_role', 'public.order_items', 'UPDATE')
    or has_table_privilege('service_role', 'public.order_items', 'DELETE') then
    raise exception 'service_role has unneeded legacy order_items access';
  end if;
  if not coalesce(
    (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.update_updated_at_column()'::regprocedure),
    false
  ) then
    raise exception 'update_updated_at_column search_path is mutable';
  end if;
end $$;

rollback;
\echo 'Runia core/legacy RLS hardening: PASS'
