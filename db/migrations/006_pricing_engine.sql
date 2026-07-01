-- Runia Catalog System - pricing engine
-- Adds product costs and cost-plus pricing rules without changing existing manual prices.

alter table public.products
  add column if not exists cost numeric not null default 0,
  add column if not exists cost_currency text not null default 'ARS';

alter table public.price_lists
  add column if not exists pricing_mode text not null default 'manual',
  add column if not exists margin_percent numeric not null default 0;

alter table public.product_prices
  add column if not exists pricing_mode text not null default 'manual',
  add column if not exists margin_percent_override numeric,
  add column if not exists calculated_from_cost boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_cost_non_negative_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_cost_non_negative_check check (cost >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_cost_currency_not_blank_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_cost_currency_not_blank_check check (btrim(cost_currency) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'price_lists_pricing_mode_check'
      and conrelid = 'public.price_lists'::regclass
  ) then
    alter table public.price_lists
      add constraint price_lists_pricing_mode_check
      check (pricing_mode in ('manual', 'cost_plus_percent'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'price_lists_margin_percent_range_check'
      and conrelid = 'public.price_lists'::regclass
  ) then
    alter table public.price_lists
      add constraint price_lists_margin_percent_range_check
      check (margin_percent between -100 and 500);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'product_prices_pricing_mode_check'
      and conrelid = 'public.product_prices'::regclass
  ) then
    alter table public.product_prices
      add constraint product_prices_pricing_mode_check
      check (pricing_mode in ('manual', 'cost_plus_percent'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'product_prices_margin_override_range_check'
      and conrelid = 'public.product_prices'::regclass
  ) then
    alter table public.product_prices
      add constraint product_prices_margin_override_range_check
      check (margin_percent_override is null or margin_percent_override between -100 and 500);
  end if;
end $$;

create index if not exists price_lists_tenant_pricing_mode_idx
  on public.price_lists(tenant_id, pricing_mode);

create index if not exists product_prices_tenant_pricing_mode_idx
  on public.product_prices(tenant_id, pricing_mode);
