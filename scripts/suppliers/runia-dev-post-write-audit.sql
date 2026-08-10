\set ON_ERROR_STOP on
\if :{?tenant_slug}
\else
  \echo 'tenant_slug is required'
  \quit 2
\endif
\if :{?audit_mode}
\else
  \echo 'audit_mode is required (first or second)'
  \quit 2
\endif

begin transaction read only;
select set_config('runia.audit.tenant_slug', :'tenant_slug', false);
select set_config('runia.audit.mode', :'audit_mode', false);

do $$
declare
  v_tenant_slug text := current_setting('runia.audit.tenant_slug');
  v_mode text := current_setting('runia.audit.mode');
  v_supplier_id uuid;
  v_run public.supplier_sync_runs%rowtype;
  v_total integer;
  v_safe integer;
  v_blocked integer;
  v_pending integer;
  v_cost_only integer;
  v_current integer;
  v_history_for_run integer;
  v_anomalies_for_run integer;
begin
  if v_mode not in ('first', 'second') then raise exception 'invalid audit_mode %', v_mode; end if;

  select s.id into strict v_supplier_id
  from public.suppliers s
  join public.tenants t on t.id = s.tenant_id
  where t.slug = v_tenant_slug and s.code = 'vinros';

  select * into strict v_run
  from public.supplier_sync_runs
  where supplier_id = v_supplier_id
  order by started_at desc, id desc
  limit 1;

  if v_run.status not in ('completed', 'completed_with_warnings') or v_run.finished_at is null then
    raise exception 'latest VINROS run is not clean: status=% finished_at=%', v_run.status, v_run.finished_at;
  end if;
  if exists (
    select 1 from public.supplier_sync_runs
    where supplier_id = v_supplier_id and status = 'running'
  ) then raise exception 'a VINROS run is still running'; end if;

  select
    count(*),
    count(*) filter (where eligibility_status = 'safe'),
    count(*) filter (where eligibility_status = 'blocked'),
    count(*) filter (where eligibility_status = 'pending_review'),
    count(*) filter (where eligibility_status = 'supplier_only_cost')
  into v_total, v_safe, v_blocked, v_pending, v_cost_only
  from public.supplier_products
  where supplier_id = v_supplier_id;

  if (v_total, v_safe, v_blocked, v_pending, v_cost_only) is distinct from (3897, 3265, 5, 16, 611) then
    raise exception 'classification mismatch total/safe/blocked/pending/cost_only = %/%/%/%/%',
      v_total, v_safe, v_blocked, v_pending, v_cost_only;
  end if;
  if v_run.products_read <> v_total then
    raise exception 'latest run products_read % != catalog %', v_run.products_read, v_total;
  end if;
  if v_run.errors < v_blocked then
    raise exception 'latest run errors % cannot explain % blocked products', v_run.errors, v_blocked;
  end if;

  select count(*) into v_current
  from public.supplier_prices sp
  join public.supplier_products p on p.id = sp.supplier_product_id
  where p.supplier_id = v_supplier_id;
  if v_current <> v_run.prices_updated + v_run.prices_unchanged then
    raise exception 'current price count % != processed prices %', v_current, v_run.prices_updated + v_run.prices_unchanged;
  end if;

  if exists (
    select 1
    from public.supplier_products p
    join public.supplier_prices sp on sp.supplier_product_id = p.id
    where p.supplier_id = v_supplier_id
      and p.eligibility_status in ('blocked', 'pending_review')
  ) then raise exception 'blocked/pending product has a current price'; end if;
  if exists (
    select 1
    from public.supplier_products p
    where p.supplier_id = v_supplier_id
      and p.eligibility_status in ('blocked', 'pending_review')
      and jsonb_array_length(coalesce(p.source_raw->'candidatePrices', '[]'::jsonb)) = 0
  ) then raise exception 'blocked/pending product lost candidate prices'; end if;
  if exists (
    select 1
    from public.supplier_products p
    left join public.supplier_prices sp on sp.supplier_product_id = p.id
    where p.supplier_id = v_supplier_id and p.eligibility_status = 'supplier_only_cost'
    group by p.id
    having count(sp.id) <> 1 or count(sp.id) filter (where sp.price_type = 'cost') <> 1
  ) then raise exception 'supplier_only_cost does not have exactly one current cost'; end if;
  if exists (
    select 1
    from public.supplier_products p
    left join public.supplier_prices sp on sp.supplier_product_id = p.id
    where p.supplier_id = v_supplier_id and p.eligibility_status = 'safe'
    group by p.id
    having count(sp.id) = 0 or count(sp.id) filter (where sp.price_type = 'retail') <> 1
  ) then raise exception 'safe product lacks current prices or retail'; end if;
  if exists (
    select 1
    from public.supplier_products p
    join public.supplier_prices sp on sp.supplier_product_id = p.id
    where p.supplier_id = v_supplier_id
      and p.eligibility_status not in ('safe', 'supplier_only_cost')
  ) then raise exception 'current price belongs to a non-promotable product'; end if;

  if exists (
    select 1
    from public.supplier_products
    where supplier_id = v_supplier_id
    group by supplier_sku
    having count(*) > 1
  ) then raise exception 'duplicate supplier SKU detected'; end if;

  select count(*) into v_history_for_run
  from public.supplier_price_history h
  join public.supplier_products p on p.id = h.supplier_product_id
  where p.supplier_id = v_supplier_id and h.sync_run_id = v_run.id;
  if v_history_for_run <> 0 then raise exception 'latest run created false history rows: %', v_history_for_run; end if;

  select count(*) into v_anomalies_for_run
  from public.supplier_anomalies
  where supplier_id = v_supplier_id and sync_run_id = v_run.id;
  if v_anomalies_for_run <> v_run.anomalies then
    raise exception 'persisted anomalies % != run anomalies %', v_anomalies_for_run, v_run.anomalies;
  end if;

  if v_mode = 'first' then
    if v_run.products_created <> v_total then
      raise exception 'first write created % products, expected %', v_run.products_created, v_total;
    end if;
    if v_run.prices_unchanged <> 0 then
      raise exception 'first write reported unchanged prices: %', v_run.prices_unchanged;
    end if;
  else
    if v_run.products_created <> 0 or v_run.prices_updated <> 0 then
      raise exception 'second write was not idempotent: products_created=% prices_updated=%',
        v_run.products_created, v_run.prices_updated;
    end if;
    if v_run.prices_unchanged <> v_current then
      raise exception 'second write unchanged=% current=%', v_run.prices_unchanged, v_current;
    end if;
  end if;
end $$;

\echo '--- VINROS post-write metrics ---'
select
  p.eligibility_status,
  count(*) as products,
  count(sp.id) as current_prices
from public.suppliers s
join public.tenants t on t.id = s.tenant_id
join public.supplier_products p on p.supplier_id = s.id
left join public.supplier_prices sp on sp.supplier_product_id = p.id
where t.slug = :'tenant_slug' and s.code = 'vinros'
group by p.eligibility_status
order by p.eligibility_status;

select sp.price_type, count(*) as current_prices
from public.suppliers s
join public.tenants t on t.id = s.tenant_id
join public.supplier_products p on p.supplier_id = s.id
join public.supplier_prices sp on sp.supplier_product_id = p.id
where t.slug = :'tenant_slug' and s.code = 'vinros'
group by sp.price_type
order by sp.price_type;

select
  r.id,
  r.status,
  r.products_read,
  r.products_created,
  r.prices_updated,
  r.prices_unchanged,
  r.warnings,
  r.errors,
  r.anomalies,
  r.started_at,
  r.finished_at
from public.supplier_sync_runs r
join public.suppliers s on s.id = r.supplier_id
join public.tenants t on t.id = s.tenant_id
where t.slug = :'tenant_slug' and s.code = 'vinros'
order by r.started_at desc
limit 2;

rollback;
\echo 'Runia Dev VINROS post-write audit: PASS'
