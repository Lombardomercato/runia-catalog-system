-- Runia Catalog System - sales engine
-- Dedicated commercial order tables with item snapshots.

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null references public.customer_accounts(id),
  status text not null default 'draft',
  price_list_id uuid not null references public.price_lists(id),
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_orders_status_check check (
    status in ('draft', 'pending', 'confirmed', 'preparing', 'delivered', 'closed', 'cancelled')
  ),
  constraint sales_orders_subtotal_non_negative check (subtotal >= 0),
  constraint sales_orders_discount_non_negative check (discount >= 0),
  constraint sales_orders_total_non_negative check (total >= 0)
);

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku_snapshot text not null,
  product_name_snapshot text not null,
  variant_snapshot text,
  unit_price_snapshot numeric not null,
  quantity numeric not null,
  subtotal numeric not null,
  created_at timestamptz not null default now(),
  constraint sales_order_items_sku_snapshot_not_blank check (btrim(sku_snapshot) <> ''),
  constraint sales_order_items_product_name_snapshot_not_blank check (btrim(product_name_snapshot) <> ''),
  constraint sales_order_items_unit_price_snapshot_non_negative check (unit_price_snapshot >= 0),
  constraint sales_order_items_quantity_positive check (quantity > 0),
  constraint sales_order_items_subtotal_non_negative check (subtotal >= 0)
);

create index if not exists sales_orders_tenant_id_idx on public.sales_orders(tenant_id);
create index if not exists sales_orders_account_id_idx on public.sales_orders(account_id);
create index if not exists sales_orders_price_list_id_idx on public.sales_orders(price_list_id);
create index if not exists sales_orders_status_idx on public.sales_orders(status);
create index if not exists sales_orders_created_at_idx on public.sales_orders(created_at);
create index if not exists sales_order_items_tenant_id_idx on public.sales_order_items(tenant_id);
create index if not exists sales_order_items_order_id_idx on public.sales_order_items(order_id);
create index if not exists sales_order_items_product_id_idx on public.sales_order_items(product_id);
create index if not exists sales_order_items_sku_snapshot_idx on public.sales_order_items(sku_snapshot);

drop trigger if exists set_sales_orders_updated_at on public.sales_orders;
create trigger set_sales_orders_updated_at
before update on public.sales_orders
for each row execute function public.update_updated_at_column();
