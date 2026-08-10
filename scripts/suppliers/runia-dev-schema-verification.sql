\set ON_ERROR_STOP on
begin transaction read only;

do $$
declare
  v_name text;
  v_definition text;
  v_function_definition text;
  v_tables constant text[] := array[
    'suppliers', 'supplier_sync_runs', 'supplier_products', 'supplier_prices',
    'supplier_price_history', 'supplier_anomalies'
  ];
  v_constraints constant text[] := array[
    'suppliers_code_not_blank', 'suppliers_name_not_blank', 'suppliers_tenant_code_key',
    'supplier_sync_runs_status_check', 'supplier_sync_runs_counts_non_negative', 'supplier_sync_runs_finished_check',
    'supplier_products_sku_not_blank', 'supplier_products_name_not_blank',
    'supplier_products_normalized_name_not_blank', 'supplier_products_eligibility_status_check',
    'supplier_products_seen_order_check', 'supplier_products_supplier_sku_key',
    'supplier_prices_type_check', 'supplier_prices_price_positive', 'supplier_prices_product_type_key',
    'supplier_price_history_type_check', 'supplier_price_history_prices_positive',
    'supplier_price_history_actual_change', 'supplier_price_history_run_change_key',
    'supplier_anomalies_fingerprint_not_blank', 'supplier_anomalies_type_not_blank',
    'supplier_anomalies_severity_check', 'supplier_anomalies_status_check',
    'supplier_anomalies_price_type_check', 'supplier_anomalies_occurrence_positive',
    'supplier_anomalies_supplier_fingerprint_key'
  ];
  v_indexes constant text[] := array[
    'supplier_sync_runs_one_running_idx', 'suppliers_tenant_id_idx',
    'supplier_sync_runs_supplier_id_idx', 'supplier_sync_runs_started_at_idx',
    'supplier_products_supplier_id_idx', 'supplier_products_eligibility_status_idx',
    'supplier_products_last_seen_at_idx', 'supplier_prices_supplier_product_id_idx',
    'supplier_price_history_supplier_product_id_changed_idx', 'supplier_price_history_sync_run_id_idx',
    'supplier_anomalies_supplier_id_status_idx', 'supplier_anomalies_supplier_product_id_idx',
    'supplier_anomalies_sync_run_id_idx'
  ];
begin
  if to_regclass('public.tenants') is null then raise exception 'missing base table public.tenants'; end if;
  if to_regprocedure('public.update_updated_at_column()') is null then raise exception 'missing base function update_updated_at_column'; end if;

  foreach v_name in array v_tables loop
    if to_regclass('public.' || v_name) is null then raise exception 'missing table public.%', v_name; end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass('public.' || v_name)) then
      raise exception 'RLS disabled on public.%', v_name;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_name) then
      raise exception 'unexpected policy on closed supplier table public.%', v_name;
    end if;
    if exists (
      select 1
      from pg_class c
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) privilege
      where c.oid = to_regclass('public.' || v_name)
        and privilege.grantee = 0
        and privilege.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ) then
      raise exception 'PUBLIC has table privileges on public.%', v_name;
    end if;
    if has_table_privilege('anon', format('public.%I', v_name), 'SELECT')
      or has_table_privilege('anon', format('public.%I', v_name), 'INSERT')
      or has_table_privilege('anon', format('public.%I', v_name), 'UPDATE')
      or has_table_privilege('anon', format('public.%I', v_name), 'DELETE') then
      raise exception 'anon has table privileges on public.%', v_name;
    end if;
    if has_table_privilege('authenticated', format('public.%I', v_name), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', v_name), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', v_name), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I', v_name), 'DELETE') then
      raise exception 'authenticated has table privileges on public.%', v_name;
    end if;
    if not has_table_privilege('service_role', format('public.%I', v_name), 'SELECT')
      or not has_table_privilege('service_role', format('public.%I', v_name), 'INSERT')
      or not has_table_privilege('service_role', format('public.%I', v_name), 'UPDATE')
      or not has_table_privilege('service_role', format('public.%I', v_name), 'DELETE') then
      raise exception 'service_role lacks CRUD on public.%', v_name;
    end if;
  end loop;

  foreach v_name in array v_constraints loop
    if not exists (
      select 1 from pg_constraint
      where connamespace = 'public'::regnamespace and conname = v_name
    ) then raise exception 'missing constraint %', v_name; end if;
  end loop;

  foreach v_name in array v_indexes loop
    if to_regclass('public.' || v_name) is null then raise exception 'missing index public.%', v_name; end if;
  end loop;

  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where connamespace = 'public'::regnamespace
    and conname = 'supplier_products_eligibility_status_check';
  foreach v_name in array array['safe', 'blocked', 'pending_review', 'supplier_only_cost'] loop
    if position(quote_literal(v_name) in v_definition) = 0 then
      raise exception 'eligibility CHECK is missing status %', v_name;
    end if;
  end loop;

  if to_regprocedure('public.supplier_open_sync_run(text,text,text,integer)') is null then
    raise exception 'missing supplier_open_sync_run RPC';
  end if;
  if to_regprocedure('public.supplier_apply_sync(uuid,jsonb)') is null then
    raise exception 'missing supplier_apply_sync RPC';
  end if;
  if exists (
    select 1 from pg_proc
    where oid in (
      'public.supplier_open_sync_run(text,text,text,integer)'::regprocedure,
      'public.supplier_apply_sync(uuid,jsonb)'::regprocedure
    ) and prosecdef
  ) then raise exception 'supplier RPC unexpectedly uses SECURITY DEFINER'; end if;

  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege
    where p.oid in (
      'public.supplier_open_sync_run(text,text,text,integer)'::regprocedure,
      'public.supplier_apply_sync(uuid,jsonb)'::regprocedure
    ) and privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
  )
    or has_function_privilege('anon', 'public.supplier_open_sync_run(text,text,text,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.supplier_open_sync_run(text,text,text,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.supplier_apply_sync(uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.supplier_apply_sync(uuid,jsonb)', 'EXECUTE') then
    raise exception 'client role can execute a supplier RPC';
  end if;
  if not has_function_privilege('service_role', 'public.supplier_open_sync_run(text,text,text,integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.supplier_apply_sync(uuid,jsonb)', 'EXECUTE') then
    raise exception 'service_role cannot execute supplier RPCs';
  end if;
  if not has_table_privilege('service_role', 'public.tenants', 'SELECT') then
    raise exception 'service_role cannot read public.tenants';
  end if;
  if not (select rolbypassrls from pg_roles where rolname = 'service_role') then
    raise exception 'service_role does not have BYPASSRLS';
  end if;
  if (select rolbypassrls from pg_roles where rolname = 'anon')
    or (select rolbypassrls from pg_roles where rolname = 'authenticated') then
    raise exception 'client role unexpectedly has BYPASSRLS';
  end if;

  select lower(pg_get_functiondef('public.supplier_apply_sync(uuid,jsonb)'::regprocedure))
  into v_function_definition;
  foreach v_name in array array[
    'supplier_sync_blocked_plan',
    'supplier_sync_product_count_mismatch',
    'supplier_sync_invalid_eligibility_status',
    'supplier_sync_non_promotable_product_has_current_prices',
    'supplier_sync_cost_only_has_commercial_price',
    'candidateprices',
    'delete from public.supplier_prices'
  ] loop
    if position(v_name in v_function_definition) = 0 then
      raise exception 'supplier_apply_sync is missing backstop %', v_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.suppliers'::regclass
      and tgname = 'set_suppliers_updated_at'
      and not tgisinternal
  ) then raise exception 'missing suppliers updated_at trigger'; end if;
end $$;

rollback;
\echo 'Runia Dev supplier schema verification: PASS'
