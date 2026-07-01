-- Runia Catalog System - accounts
-- Extends commercial accounts without changing the existing order relationship.

alter table public.customer_accounts
  add column if not exists legal_name text,
  add column if not exists tax_id text,
  add column if not exists whatsapp_phone text,
  add column if not exists address text,
  add column if not exists discount_percent numeric not null default 0,
  add column if not exists credit_limit numeric,
  add column if not exists commercial_terms text,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

update public.customer_accounts
set whatsapp_phone = phone
where whatsapp_phone is null
  and phone is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_accounts_email_format_check'
  ) then
    alter table public.customer_accounts
      add constraint customer_accounts_email_format_check
      check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'customer_accounts_tax_id_not_blank_check'
  ) then
    alter table public.customer_accounts
      add constraint customer_accounts_tax_id_not_blank_check
      check (tax_id is null or btrim(tax_id) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'customer_accounts_discount_percent_range_check'
  ) then
    alter table public.customer_accounts
      add constraint customer_accounts_discount_percent_range_check
      check (discount_percent >= 0 and discount_percent <= 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'customer_accounts_credit_limit_non_negative_check'
  ) then
    alter table public.customer_accounts
      add constraint customer_accounts_credit_limit_non_negative_check
      check (credit_limit is null or credit_limit >= 0);
  end if;
end $$;

create table if not exists public.account_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null references public.customer_accounts(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  whatsapp_phone text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_contacts_name_not_blank check (btrim(name) <> ''),
  constraint account_contacts_email_format_check check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create table if not exists public.account_addresses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null references public.customer_accounts(id) on delete cascade,
  label text,
  address_line text not null,
  city text,
  province text,
  postal_code text,
  country text not null default 'AR',
  is_primary boolean not null default false,
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_addresses_address_line_not_blank check (btrim(address_line) <> ''),
  constraint account_addresses_country_not_blank check (btrim(country) <> '')
);

create index if not exists customer_accounts_tenant_status_idx on public.customer_accounts(tenant_id, status);
create index if not exists customer_accounts_tenant_price_list_idx on public.customer_accounts(tenant_id, price_list_id);
create index if not exists customer_accounts_tenant_tax_id_idx on public.customer_accounts(tenant_id, tax_id);
create index if not exists account_contacts_tenant_id_idx on public.account_contacts(tenant_id);
create index if not exists account_contacts_account_id_idx on public.account_contacts(account_id);
create index if not exists account_addresses_tenant_id_idx on public.account_addresses(tenant_id);
create index if not exists account_addresses_account_id_idx on public.account_addresses(account_id);

drop trigger if exists set_account_contacts_updated_at on public.account_contacts;
create trigger set_account_contacts_updated_at
before update on public.account_contacts
for each row execute function public.update_updated_at_column();

drop trigger if exists set_account_addresses_updated_at on public.account_addresses;
create trigger set_account_addresses_updated_at
before update on public.account_addresses
for each row execute function public.update_updated_at_column();
