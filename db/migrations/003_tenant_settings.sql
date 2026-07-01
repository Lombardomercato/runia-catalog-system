-- Runia Catalog System - tenant settings
-- Adds tenant-owned configuration needed to operate Runia as a multi-tenant SaaS.

alter table public.tenants
  add column if not exists legal_name text,
  add column if not exists contact_email text,
  add column if not exists whatsapp_phone text,
  add column if not exists address text,
  add column if not exists website_url text,
  add column if not exists logo_url text,
  add column if not exists primary_color text not null default '#14b8a6',
  add column if not exists secondary_color text not null default '#0f172a',
  add column if not exists currency text not null default 'ARS',
  add column if not exists minimum_order_amount numeric not null default 0,
  add column if not exists minimum_purchase_amount numeric not null default 0,
  add column if not exists default_price_list_id uuid references public.price_lists(id) on delete set null,
  add column if not exists feature_public_catalog boolean not null default true,
  add column if not exists feature_orders boolean not null default true,
  add column if not exists feature_wholesale_login boolean not null default false,
  add column if not exists feature_multiple_price_lists boolean not null default true,
  add column if not exists feature_importer boolean not null default true,
  add column if not exists feature_images boolean not null default false,
  add column if not exists feature_stock boolean not null default false,
  add column if not exists feature_invoicing boolean not null default false;

update public.tenants tenant
set default_price_list_id = price_list.id
from public.price_lists price_list
where price_list.tenant_id = tenant.id
  and price_list.code = 'minorista'
  and tenant.default_price_list_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_primary_color_format_check'
  ) then
    alter table public.tenants
      add constraint tenants_primary_color_format_check
      check (primary_color ~* '^#[0-9a-f]{6}$');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tenants_secondary_color_format_check'
  ) then
    alter table public.tenants
      add constraint tenants_secondary_color_format_check
      check (secondary_color ~* '^#[0-9a-f]{6}$');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tenants_currency_not_blank_check'
  ) then
    alter table public.tenants
      add constraint tenants_currency_not_blank_check
      check (btrim(currency) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tenants_minimum_order_amount_non_negative_check'
  ) then
    alter table public.tenants
      add constraint tenants_minimum_order_amount_non_negative_check
      check (minimum_order_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tenants_minimum_purchase_amount_non_negative_check'
  ) then
    alter table public.tenants
      add constraint tenants_minimum_purchase_amount_non_negative_check
      check (minimum_purchase_amount >= 0);
  end if;
end $$;

create index if not exists tenants_default_price_list_id_idx on public.tenants(default_price_list_id);
