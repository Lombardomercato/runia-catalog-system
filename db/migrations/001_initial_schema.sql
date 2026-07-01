-- Runia Catalog System - initial Supabase schema
-- TODO: Enable and define Row Level Security policies before exposing admin/client data from the app.

create extension if not exists pgcrypto;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_status_check check (status in ('active', 'inactive', 'archived')),
  constraint tenants_slug_not_blank check (btrim(slug) <> '')
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  external_id text,
  name text not null,
  slug text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (btrim(name) <> ''),
  constraint categories_external_id_not_blank check (external_id is null or btrim(external_id) <> ''),
  constraint categories_slug_not_blank check (slug is null or btrim(slug) <> ''),
  constraint categories_tenant_external_id_key unique (tenant_id, external_id),
  constraint categories_tenant_slug_key unique (tenant_id, slug)
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  external_id text,
  name text not null,
  slug text,
  price_adjustment_percent numeric not null default 0,
  is_controlled_placeholder boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brands_name_not_blank check (btrim(name) <> ''),
  constraint brands_external_id_not_blank check (external_id is null or btrim(external_id) <> ''),
  constraint brands_slug_not_blank check (slug is null or btrim(slug) <> ''),
  constraint brands_tenant_external_id_key unique (tenant_id, external_id),
  constraint brands_tenant_slug_key unique (tenant_id, slug)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text not null,
  category_id uuid not null references public.categories(id),
  brand_id uuid not null references public.brands(id),
  product_line text,
  name text not null,
  variant text,
  description text,
  source_page text,
  internal_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_sku_not_blank check (btrim(sku) <> ''),
  constraint products_name_not_blank check (btrim(name) <> ''),
  constraint products_tenant_sku_key unique (tenant_id, sku)
);

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_lists_name_not_blank check (btrim(name) <> ''),
  constraint price_lists_code_not_blank check (btrim(code) <> ''),
  constraint price_lists_tenant_code_key unique (tenant_id, code)
);

create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price_list_id uuid not null references public.price_lists(id),
  price numeric not null,
  currency text not null default 'ARS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_prices_price_non_negative check (price >= 0),
  constraint product_prices_currency_not_blank check (btrim(currency) <> ''),
  constraint product_prices_product_list_key unique (product_id, price_list_id)
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt_text text,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_images_url_not_blank check (btrim(url) <> '')
);

create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  price_list_id uuid references public.price_lists(id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_accounts_name_not_blank check (btrim(name) <> ''),
  constraint customer_accounts_status_check check (status in ('active', 'inactive', 'pending', 'blocked'))
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_account_id uuid references public.customer_accounts(id),
  customer_name text,
  customer_phone text,
  customer_email text,
  price_list_id uuid references public.price_lists(id),
  status text not null default 'draft',
  total numeric not null default 0,
  whatsapp_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_status_check check (status in ('draft', 'sent', 'confirmed', 'cancelled')),
  constraint orders_total_non_negative check (total >= 0)
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  sku text,
  product_name text,
  variant text,
  quantity numeric not null,
  unit_price numeric not null,
  subtotal numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_unit_price_non_negative check (unit_price >= 0),
  constraint order_items_subtotal_non_negative check (subtotal >= 0)
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_name text,
  status text not null default 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  summary_json jsonb,
  created_at timestamptz not null default now(),
  constraint import_batches_status_check check (status in ('pending', 'processing', 'completed', 'completed_with_errors', 'failed'))
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  sheet_name text,
  row_number int,
  target_table text,
  target_record_id uuid,
  status text,
  error_message text,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  constraint import_rows_row_number_positive check (row_number is null or row_number > 0),
  constraint import_rows_status_check check (status is null or status in ('pending', 'processing', 'success', 'error', 'skipped'))
);

drop trigger if exists set_tenants_updated_at on public.tenants;
create trigger set_tenants_updated_at
before update on public.tenants
for each row execute function public.update_updated_at_column();

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at
before update on public.categories
for each row execute function public.update_updated_at_column();

drop trigger if exists set_brands_updated_at on public.brands;
create trigger set_brands_updated_at
before update on public.brands
for each row execute function public.update_updated_at_column();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.update_updated_at_column();

drop trigger if exists set_price_lists_updated_at on public.price_lists;
create trigger set_price_lists_updated_at
before update on public.price_lists
for each row execute function public.update_updated_at_column();

drop trigger if exists set_product_prices_updated_at on public.product_prices;
create trigger set_product_prices_updated_at
before update on public.product_prices
for each row execute function public.update_updated_at_column();

drop trigger if exists set_product_images_updated_at on public.product_images;
create trigger set_product_images_updated_at
before update on public.product_images
for each row execute function public.update_updated_at_column();

drop trigger if exists set_customer_accounts_updated_at on public.customer_accounts;
create trigger set_customer_accounts_updated_at
before update on public.customer_accounts
for each row execute function public.update_updated_at_column();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.update_updated_at_column();

drop trigger if exists set_order_items_updated_at on public.order_items;
create trigger set_order_items_updated_at
before update on public.order_items
for each row execute function public.update_updated_at_column();

create index if not exists tenants_status_idx on public.tenants(status);

create index if not exists categories_tenant_id_idx on public.categories(tenant_id);
create index if not exists categories_slug_idx on public.categories(slug);
create index if not exists categories_active_idx on public.categories(is_active);

create index if not exists brands_tenant_id_idx on public.brands(tenant_id);
create index if not exists brands_slug_idx on public.brands(slug);
create index if not exists brands_active_idx on public.brands(is_active);

create index if not exists products_tenant_id_idx on public.products(tenant_id);
create index if not exists products_sku_idx on public.products(sku);
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_brand_id_idx on public.products(brand_id);
create index if not exists products_active_idx on public.products(is_active);

create index if not exists price_lists_tenant_id_idx on public.price_lists(tenant_id);
create index if not exists price_lists_code_idx on public.price_lists(code);
create index if not exists price_lists_active_idx on public.price_lists(is_active);

create index if not exists product_prices_tenant_id_idx on public.product_prices(tenant_id);
create index if not exists product_prices_product_id_idx on public.product_prices(product_id);
create index if not exists product_prices_price_list_id_idx on public.product_prices(price_list_id);

create index if not exists product_images_tenant_id_idx on public.product_images(tenant_id);
create index if not exists product_images_product_id_idx on public.product_images(product_id);

create index if not exists customer_accounts_tenant_id_idx on public.customer_accounts(tenant_id);
create index if not exists customer_accounts_price_list_id_idx on public.customer_accounts(price_list_id);
create index if not exists customer_accounts_status_idx on public.customer_accounts(status);
create index if not exists customer_accounts_email_idx on public.customer_accounts(email);

create index if not exists orders_tenant_id_idx on public.orders(tenant_id);
create index if not exists orders_customer_account_id_idx on public.orders(customer_account_id);
create index if not exists orders_price_list_id_idx on public.orders(price_list_id);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_created_at_idx on public.orders(created_at);

create index if not exists order_items_tenant_id_idx on public.order_items(tenant_id);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists order_items_sku_idx on public.order_items(sku);

create index if not exists import_batches_tenant_id_idx on public.import_batches(tenant_id);
create index if not exists import_batches_status_idx on public.import_batches(status);

create index if not exists import_rows_tenant_id_idx on public.import_rows(tenant_id);
create index if not exists import_rows_batch_id_idx on public.import_rows(batch_id);
create index if not exists import_rows_target_table_idx on public.import_rows(target_table);
create index if not exists import_rows_status_idx on public.import_rows(status);
