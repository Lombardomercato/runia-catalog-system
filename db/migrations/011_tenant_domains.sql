-- Runia Catalog System - hostname to tenant mapping
--
-- No domain or Lombardo tenant is inserted by this migration.

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  hostname text not null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_domains_hostname_normalized_check
    check (
      hostname = lower(btrim(hostname))
      and hostname !~ '[/:\s]'
      and hostname <> ''
    ),
  constraint tenant_domains_hostname_key unique (hostname),
  constraint tenant_domains_tenant_id_id_key unique (tenant_id, id)
);

create unique index if not exists tenant_domains_one_primary_per_tenant_idx
  on public.tenant_domains(tenant_id)
  where is_primary = true;
create index if not exists tenant_domains_tenant_active_idx
  on public.tenant_domains(tenant_id, is_active);

drop trigger if exists set_tenant_domains_updated_at on public.tenant_domains;
create trigger set_tenant_domains_updated_at
before update on public.tenant_domains
for each row execute function public.update_updated_at_column();

alter table public.tenant_domains enable row level security;
revoke all on table public.tenant_domains from anon, authenticated;

drop policy if exists server_only_deny_anon on public.tenant_domains;
create policy server_only_deny_anon
on public.tenant_domains for all to anon
using (false)
with check (false);

drop policy if exists server_only_deny_authenticated on public.tenant_domains;
create policy server_only_deny_authenticated
on public.tenant_domains for all to authenticated
using (false)
with check (false);

comment on table public.tenant_domains is
  'Server-resolved hostname mapping. Never trust a browser-supplied tenant slug in production.';
