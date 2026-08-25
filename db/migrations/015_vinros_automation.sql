-- Auditable, single-flight scheduler runs for supplier synchronization.
-- Supplier catalog writes remain delegated to supplier_apply_sync.

create table public.supplier_sync_automation_runs (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  trigger_source text not null,
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  dry_run_result jsonb,
  write_result jsonb,
  products integer not null default 0,
  prices_changed integer not null default 0,
  blocked integer not null default 0,
  pending_review integer not null default 0,
  supplier_only_cost integer not null default 0,
  warnings integer not null default 0,
  errors integer not null default 0,
  error_summary text,
  alert_status text not null default 'pending',
  alert_sent_at timestamptz,
  alert_provider_message_id text,
  alert_error_summary text,
  constraint supplier_sync_automation_runs_trigger_check check (
    trigger_source in ('schedule', 'manual', 'test')
  ),
  constraint supplier_sync_automation_runs_status_check check (
    status in (
      'running',
      'completed',
      'completed_with_warnings',
      'blocked',
      'failed',
      'skipped_concurrent'
    )
  ),
  constraint supplier_sync_automation_runs_counts_check check (
    products >= 0 and prices_changed >= 0 and blocked >= 0
    and pending_review >= 0 and supplier_only_cost >= 0
    and warnings >= 0 and errors >= 0
  ),
  constraint supplier_sync_automation_runs_finished_check check (
    (status = 'running' and finished_at is null)
    or (status <> 'running' and finished_at is not null)
  ),
  constraint supplier_sync_automation_runs_alert_check check (
    alert_status in ('pending', 'not_required', 'sent', 'failed')
  )
);

create unique index supplier_sync_automation_runs_one_running_idx
  on public.supplier_sync_automation_runs(supplier_id)
  where status = 'running';

create index supplier_sync_automation_runs_supplier_started_idx
  on public.supplier_sync_automation_runs(supplier_id, started_at desc);

alter table public.supplier_sync_automation_runs enable row level security;

revoke all on table public.supplier_sync_automation_runs from anon, authenticated;
grant select, insert, update on table public.supplier_sync_automation_runs to service_role;

create or replace function public.supplier_start_automation_run(
  p_tenant_slug text,
  p_supplier_code text,
  p_trigger_source text,
  p_lease_seconds integer default 1800
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_supplier_id uuid;
  v_running_id uuid;
  v_run_id uuid;
begin
  if btrim(coalesce(p_tenant_slug, '')) = ''
    or btrim(coalesce(p_supplier_code, '')) = '' then
    raise exception using errcode = '22023', message = 'SUPPLIER_AUTOMATION_INVALID_TARGET';
  end if;
  if p_trigger_source not in ('schedule', 'manual', 'test') then
    raise exception using errcode = '22023', message = 'SUPPLIER_AUTOMATION_INVALID_TRIGGER';
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 86400 then
    raise exception using errcode = '22023', message = 'SUPPLIER_AUTOMATION_INVALID_LEASE';
  end if;

  select supplier.id
  into v_supplier_id
  from public.suppliers supplier
  join public.tenants tenant on tenant.id = supplier.tenant_id
  where tenant.slug = p_tenant_slug
    and tenant.status = 'active'
    and supplier.code = lower(btrim(p_supplier_code))
    and supplier.active = true;

  if not found then
    raise exception using errcode = 'P0002', message = 'SUPPLIER_AUTOMATION_TARGET_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('supplier-automation:' || v_supplier_id::text, 0)
  );

  update public.supplier_sync_automation_runs
  set
    status = 'failed',
    finished_at = now(),
    errors = greatest(errors, 1),
    error_summary = 'STALE_AUTOMATION_RUN_ABANDONED',
    alert_status = 'failed',
    alert_error_summary = 'STALE_AUTOMATION_RUN_REQUIRES_REVIEW'
  where supplier_id = v_supplier_id
    and status = 'running'
    and heartbeat_at < now() - make_interval(secs => p_lease_seconds);

  select id
  into v_running_id
  from public.supplier_sync_automation_runs
  where supplier_id = v_supplier_id
    and status = 'running'
  limit 1;

  if v_running_id is not null then
    insert into public.supplier_sync_automation_runs (
      supplier_id,
      trigger_source,
      status,
      finished_at,
      error_summary,
      alert_status
    ) values (
      v_supplier_id,
      p_trigger_source,
      'skipped_concurrent',
      now(),
      'SUPPLIER_AUTOMATION_ALREADY_RUNNING',
      'not_required'
    ) returning id into v_run_id;

    return jsonb_build_object(
      'claimed', false,
      'runId', v_run_id,
      'activeRunId', v_running_id,
      'supplierId', v_supplier_id
    );
  end if;

  insert into public.supplier_sync_automation_runs (
    supplier_id,
    trigger_source,
    status,
    started_at,
    heartbeat_at
  ) values (
    v_supplier_id,
    p_trigger_source,
    'running',
    now(),
    now()
  ) returning id into v_run_id;

  return jsonb_build_object(
    'claimed', true,
    'runId', v_run_id,
    'supplierId', v_supplier_id
  );
end;
$$;

revoke all on function public.supplier_start_automation_run(
  text,
  text,
  text,
  integer
) from public, anon, authenticated;
grant execute on function public.supplier_start_automation_run(
  text,
  text,
  text,
  integer
) to service_role;

create or replace function public.supplier_finish_automation_run(
  p_run_id uuid,
  p_status text,
  p_dry_run_result jsonb,
  p_write_result jsonb,
  p_products integer,
  p_prices_changed integer,
  p_blocked integer,
  p_pending_review integer,
  p_supplier_only_cost integer,
  p_warnings integer,
  p_errors integer,
  p_error_summary text,
  p_alert_status text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_status not in ('completed', 'completed_with_warnings', 'blocked', 'failed') then
    raise exception using errcode = '22023', message = 'SUPPLIER_AUTOMATION_INVALID_FINAL_STATUS';
  end if;
  if p_alert_status not in ('pending', 'not_required') then
    raise exception using errcode = '22023', message = 'SUPPLIER_AUTOMATION_INVALID_ALERT_STATUS';
  end if;

  update public.supplier_sync_automation_runs
  set
    heartbeat_at = now(),
    finished_at = now(),
    status = p_status,
    dry_run_result = p_dry_run_result,
    write_result = p_write_result,
    products = greatest(coalesce(p_products, 0), 0),
    prices_changed = greatest(coalesce(p_prices_changed, 0), 0),
    blocked = greatest(coalesce(p_blocked, 0), 0),
    pending_review = greatest(coalesce(p_pending_review, 0), 0),
    supplier_only_cost = greatest(coalesce(p_supplier_only_cost, 0), 0),
    warnings = greatest(coalesce(p_warnings, 0), 0),
    errors = greatest(coalesce(p_errors, 0), 0),
    error_summary = nullif(left(coalesce(p_error_summary, ''), 2000), ''),
    alert_status = p_alert_status
  where id = p_run_id
    and status = 'running';

  if not found then
    raise exception using errcode = '55000', message = 'SUPPLIER_AUTOMATION_RUN_NOT_RUNNING';
  end if;
end;
$$;

revoke all on function public.supplier_finish_automation_run(
  uuid,
  text,
  jsonb,
  jsonb,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.supplier_finish_automation_run(
  uuid,
  text,
  jsonb,
  jsonb,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  text,
  text
) to service_role;

comment on table public.supplier_sync_automation_runs is
  'Auditable dry-run, policy decision, write and alert outcome for automated supplier syncs.';
