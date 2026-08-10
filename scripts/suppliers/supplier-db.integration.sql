\set ON_ERROR_STOP on
\if :{?supplier_test_tenant_slug}
\else
  \set supplier_test_tenant_slug 'supplier-integration-test'
\endif
begin;

insert into public.tenants (name, slug) values ('Supplier Integration Test', :'supplier_test_tenant_slug');
select set_config('supplier.test_tenant_slug', :'supplier_test_tenant_slug', true);

do $$
begin
  if has_function_privilege('anon', 'public.supplier_open_sync_run(text,text,text,integer)', 'execute') then raise exception 'anon can open run'; end if;
  if has_function_privilege('authenticated', 'public.supplier_apply_sync(uuid,jsonb)', 'execute') then raise exception 'authenticated can apply run'; end if;
  if not has_function_privilege('service_role', 'public.supplier_open_sync_run(text,text,text,integer)', 'execute') then raise exception 'service_role cannot open run'; end if;
  if not has_function_privilege('service_role', 'public.supplier_apply_sync(uuid,jsonb)', 'execute') then raise exception 'service_role cannot apply run'; end if;
  if has_table_privilege('anon', 'public.supplier_prices', 'select') or has_table_privilege('authenticated', 'public.supplier_prices', 'select') then raise exception 'client role can read supplier prices'; end if;
end $$;

create function pg_temp.test_plan(
  p_price numeric,
  p_name text,
  p_update_metadata boolean,
  p_sku text default 'SKU-1',
  p_eligibility_status text default 'safe'
) returns jsonb
language sql as $$
  select jsonb_build_object(
    'canApply', true, 'status', 'completed', 'productsRead', 1, 'warnings', 0, 'errors', 0,
    'sourceSummary', '{}'::jsonb, 'anomalies', '[]'::jsonb,
    'products', jsonb_build_array(jsonb_build_object(
      'supplierSku', p_sku, 'nameRaw', p_name, 'presentationRaw', '750cc',
      'normalizedName', lower(p_name), 'normalizedPresentation', '750 ml',
      'eligibilityStatus', p_eligibility_status,
      'updateCanonicalMetadata', p_update_metadata, 'rawData', jsonb_build_object('candidateName', p_name),
      'candidatePrices', '[]'::jsonb,
      'prices', jsonb_build_array(jsonb_build_object(
        'priceType', 'retail', 'action', 'update', 'newPrice', p_price,
        'sourceEmissionDate', '2026-08-01', 'sourceHttpLastModified', '2026-08-01T12:00:00Z',
        'fetchedAt', '2026-08-07T12:00:00Z', 'rawData', '{}'::jsonb
      ))
    ))
  )
$$;

create function pg_temp.test_supplier_id() returns uuid
language sql stable as $$
  select s.id
  from public.suppliers s
  join public.tenants t on t.id = s.tenant_id
  where t.slug = current_setting('supplier.test_tenant_slug') and s.code = 'vinros'
$$;

-- Database backstop: a partial/blocked plan cannot mutate the catalog.
select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as blocked_run_id \gset
do $$ begin
  begin
    perform public.supplier_apply_sync((select id from public.supplier_sync_runs where supplier_id = pg_temp.test_supplier_id() and status = 'running'), jsonb_build_object('canApply', false, 'status', 'failed'));
    raise exception 'blocked plan unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
  if exists (select 1 from public.supplier_products where supplier_id = pg_temp.test_supplier_id()) then raise exception 'blocked plan wrote catalog'; end if;
end $$;
update public.supplier_sync_runs set status = 'failed', finished_at = now(), error_message = 'expected blocked plan' where id = :'blocked_run_id'::uuid;

-- A previously safe product demoted to pending loses current and retains its candidate.
select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as pending_safe_run_id \gset
select public.supplier_apply_sync(:'pending_safe_run_id'::uuid, pg_temp.test_plan(500, 'Precio candidato', true, 'PENDING-1'));

select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as candidate_run_id \gset
select public.supplier_apply_sync(
  :'candidate_run_id'::uuid,
  jsonb_build_object(
    'canApply', true, 'status', 'completed_with_warnings', 'productsRead', 1, 'warnings', 1, 'errors', 0,
    'sourceSummary', '{}'::jsonb, 'anomalies', '[]'::jsonb,
    'products', jsonb_build_array(jsonb_build_object(
      'supplierSku', 'PENDING-1', 'nameRaw', 'Precio candidato', 'presentationRaw', '750cc',
      'normalizedName', 'precio candidato', 'normalizedPresentation', '750 ml',
      'eligibilityStatus', 'pending_review', 'updateCanonicalMetadata', true,
      'rawData', '{}'::jsonb, 'prices', '[]'::jsonb,
      'candidatePrices', jsonb_build_array(jsonb_build_object(
        'priceType', 'retail', 'observedPrice', 140, 'reason', 'pending_review',
        'sourceEmissionDate', '2026-08-01', 'sourceHttpLastModified', null,
        'fetchedAt', '2026-08-07T12:00:00Z', 'rawData', '{}'::jsonb
      ))
    ))
  )
);
do $$ begin
  if (select eligibility_status from public.supplier_products where supplier_id = pg_temp.test_supplier_id() and supplier_sku = 'PENDING-1') <> 'pending_review' then raise exception 'pending eligibility was not persisted'; end if;
  if exists (select 1 from public.supplier_prices sp join public.supplier_products p on p.id = sp.supplier_product_id where p.supplier_id = pg_temp.test_supplier_id() and p.supplier_sku = 'PENDING-1') then raise exception 'pending candidate became current'; end if;
  if jsonb_array_length((select source_raw->'candidatePrices' from public.supplier_products where supplier_id = pg_temp.test_supplier_id() and supplier_sku = 'PENDING-1')) <> 1 then raise exception 'candidate raw was not retained'; end if;
end $$;

-- A previously safe product demoted to blocked loses current and retains its candidate.
select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as blocked_safe_run_id \gset
select public.supplier_apply_sync(:'blocked_safe_run_id'::uuid, pg_temp.test_plan(500, 'Precio bloqueado', true, 'BLOCKED-1'));

select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as blocked_candidate_run_id \gset
select public.supplier_apply_sync(
  :'blocked_candidate_run_id'::uuid,
  jsonb_build_object(
    'canApply', true, 'status', 'completed_with_warnings', 'productsRead', 1, 'warnings', 0, 'errors', 1,
    'sourceSummary', '{}'::jsonb, 'anomalies', '[]'::jsonb,
    'products', jsonb_build_array(jsonb_build_object(
      'supplierSku', 'BLOCKED-1', 'nameRaw', 'Precio bloqueado', 'presentationRaw', '750cc',
      'normalizedName', 'precio bloqueado', 'normalizedPresentation', '750 ml',
      'eligibilityStatus', 'blocked', 'updateCanonicalMetadata', true,
      'rawData', '{}'::jsonb, 'prices', '[]'::jsonb,
      'candidatePrices', jsonb_build_array(jsonb_build_object(
        'priceType', 'retail', 'observedPrice', 0.1, 'reason', 'blocked',
        'sourceEmissionDate', '2026-08-01', 'sourceHttpLastModified', null,
        'fetchedAt', '2026-08-07T12:00:00Z', 'rawData', '{}'::jsonb
      ))
    ))
  )
);
do $$ begin
  if (select eligibility_status from public.supplier_products where supplier_id = pg_temp.test_supplier_id() and supplier_sku = 'BLOCKED-1') <> 'blocked' then raise exception 'blocked eligibility was not persisted'; end if;
  if exists (select 1 from public.supplier_prices sp join public.supplier_products p on p.id = sp.supplier_product_id where p.supplier_id = pg_temp.test_supplier_id() and p.supplier_sku = 'BLOCKED-1') then raise exception 'blocked candidate became current'; end if;
  if jsonb_array_length((select source_raw->'candidatePrices' from public.supplier_products where supplier_id = pg_temp.test_supplier_id() and supplier_sku = 'BLOCKED-1')) <> 1 then raise exception 'blocked candidate raw was not retained'; end if;
end $$;

-- A previously safe product demoted to cost-only loses commercial current and keeps cost.
select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as cost_safe_run_id \gset
select public.supplier_apply_sync(:'cost_safe_run_id'::uuid, pg_temp.test_plan(500, 'Solo costo', true, 'COST-ONLY-1'));

select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as cost_run_id \gset
select public.supplier_apply_sync(
  :'cost_run_id'::uuid,
  jsonb_set(pg_temp.test_plan(321.45, 'Solo costo', true, 'COST-ONLY-1', 'supplier_only_cost'), '{products,0,prices,0,priceType}', '"cost"'::jsonb)
);
do $$ begin
  if (select eligibility_status from public.supplier_products where supplier_id = pg_temp.test_supplier_id() and supplier_sku = 'COST-ONLY-1') <> 'supplier_only_cost' then raise exception 'cost-only eligibility was not persisted'; end if;
  if (select count(*) from public.supplier_prices sp join public.supplier_products p on p.id = sp.supplier_product_id where p.supplier_id = pg_temp.test_supplier_id() and p.supplier_sku = 'COST-ONLY-1' and sp.price_type = 'cost') <> 1 then raise exception 'cost-only current cost missing'; end if;
  if exists (select 1 from public.supplier_prices sp join public.supplier_products p on p.id = sp.supplier_product_id where p.supplier_id = pg_temp.test_supplier_id() and p.supplier_sku = 'COST-ONLY-1' and sp.price_type <> 'cost') then raise exception 'cost-only retained commercial current'; end if;
end $$;

-- Database backstop rejects any current price attached to pending/blocked metadata.
select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as quarantine_run_id \gset
do $$ begin
  begin
    perform public.supplier_apply_sync(
      (select id from public.supplier_sync_runs where supplier_id = pg_temp.test_supplier_id() and status = 'running'),
      pg_temp.test_plan(999, 'Blocked invalid', true, 'BLOCKED-INVALID', 'blocked')
    );
    raise exception 'blocked current price unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
  if exists (select 1 from public.supplier_products where supplier_id = pg_temp.test_supplier_id() and supplier_sku = 'BLOCKED-INVALID') then raise exception 'blocked invalid plan wrote metadata'; end if;
end $$;
update public.supplier_sync_runs set status = 'failed', finished_at = now(), error_message = 'expected quarantine rejection' where id = :'quarantine_run_id'::uuid;

select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as run_id \gset
select public.supplier_apply_sync(:'run_id'::uuid, pg_temp.test_plan(100, 'Vino Canonico', true));

-- Idempotent retry: same value creates no history.
select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as run_id \gset
select public.supplier_apply_sync(:'run_id'::uuid, pg_temp.test_plan(100, 'Vino Canonico', true));
do $$ begin
  if (select count(*) from public.supplier_products where supplier_id = pg_temp.test_supplier_id() and supplier_sku = 'SKU-1') <> 1 then raise exception 'idempotency product failure'; end if;
  if (select count(*) from public.supplier_prices sp join public.supplier_products p on p.id = sp.supplier_product_id where p.supplier_id = pg_temp.test_supplier_id() and p.supplier_sku = 'SKU-1') <> 1 then raise exception 'idempotency price failure'; end if;
  if (select count(*) from public.supplier_price_history h join public.supplier_products p on p.id = h.supplier_product_id where p.supplier_id = pg_temp.test_supplier_id() and p.supplier_sku = 'SKU-1') <> 0 then raise exception 'unchanged price created history'; end if;
end $$;

-- Changed price creates exactly one history row; conflicting candidate does not overwrite canonical metadata.
select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as run_id \gset
select public.supplier_apply_sync(:'run_id'::uuid, pg_temp.test_plan(110, 'Aceite Industrial', false));
do $$ begin
  if (select name_raw from public.supplier_products where supplier_id = pg_temp.test_supplier_id() and supplier_sku = 'SKU-1') <> 'Vino Canonico' then raise exception 'canonical metadata overwritten'; end if;
  if (select source_raw->>'candidateName' from public.supplier_products where supplier_id = pg_temp.test_supplier_id() and supplier_sku = 'SKU-1') <> 'Aceite Industrial' then raise exception 'candidate metadata not retained'; end if;
  if (select count(*) from public.supplier_price_history h join public.supplier_products p on p.id = h.supplier_product_id where p.supplier_id = pg_temp.test_supplier_id() and p.supplier_sku = 'SKU-1') <> 1 then raise exception 'history failure'; end if;
end $$;

-- A late invalid product rolls the whole RPC back, including an earlier valid row.
select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as run_id \gset
do $$
declare
  v_run uuid := (select id from public.supplier_sync_runs where supplier_id = pg_temp.test_supplier_id() and status = 'running' order by started_at desc limit 1);
  v_before integer := (select count(*) from public.supplier_products where supplier_id = pg_temp.test_supplier_id());
  v_plan jsonb := pg_temp.test_plan(120, 'Valido', true, 'ROLLBACK-OK');
begin
  v_plan := jsonb_set(v_plan, '{products}', (v_plan->'products') || jsonb_build_array(jsonb_build_object('supplierSku', '', 'nameRaw', 'Invalido', 'normalizedName', 'invalido', 'prices', '[]'::jsonb)));
  begin
    perform public.supplier_apply_sync(v_run, v_plan);
    raise exception 'invalid RPC unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
  if (select count(*) from public.supplier_products where supplier_id = pg_temp.test_supplier_id()) <> v_before then raise exception 'RPC did not roll back completely'; end if;
end $$;
update public.supplier_sync_runs set heartbeat_at = now() - interval '2 minutes' where id = :'run_id'::uuid;

-- Retry abandons a stale run and allows one replacement; a fresh concurrent/duplicate run is rejected.
select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as fresh_run_id \gset
do $$
begin
  if not exists (select 1 from public.supplier_sync_runs where supplier_id = pg_temp.test_supplier_id() and error_message = 'STALE_RUN_ABANDONED' and status = 'failed') then raise exception 'stale run was not abandoned'; end if;
  begin
    perform public.supplier_open_sync_run(current_setting('supplier.test_tenant_slug'), 'vinros', 'VINROS', 60);
    raise exception 'concurrent run unexpectedly succeeded';
  exception when sqlstate '55P03' then null;
  end;
end $$;
update public.supplier_sync_runs set status = 'failed', finished_at = now(), error_message = 'test close' where id = :'fresh_run_id'::uuid;

-- RPC path with >1,000 products.
select public.supplier_open_sync_run(:'supplier_test_tenant_slug', 'vinros', 'VINROS', 60) as opened \gset
select :'opened'::jsonb->>'runId' as bulk_run_id \gset
select public.supplier_apply_sync(
  :'bulk_run_id'::uuid,
  jsonb_build_object(
    'canApply', true, 'status', 'completed', 'productsRead', 1001, 'warnings', 0, 'errors', 0,
    'sourceSummary', '{}'::jsonb, 'anomalies', '[]'::jsonb,
    'products', (select jsonb_agg((pg_temp.test_plan(100 + n, 'Producto ' || n, true, 'BULK-' || n)->'products'->0)) from generate_series(1, 1001) n)
  )
);
do $$ begin
  if (select count(*) from public.supplier_products where supplier_id = pg_temp.test_supplier_id() and supplier_sku like 'BULK-%') <> 1001 then raise exception 'bulk RPC lost products'; end if;
end $$;

rollback;
\echo 'supplier DB integration: PASS (transaction rolled back)'
