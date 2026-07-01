-- Runia Catalog System - initial RB Distribuidora seed
-- Run after db/migrations/001_initial_schema.sql.

with tenant_row as (
  insert into public.tenants (name, slug, status)
  values ('RB Distribuidora', 'rb-distribuidora', 'active')
  on conflict (slug) do update
    set name = excluded.name,
        status = excluded.status
  returning id
)
insert into public.price_lists (tenant_id, name, code, is_default, is_active)
select tenant_row.id, price_list.name, price_list.code, price_list.is_default, true
from tenant_row
cross join (
  values
    ('Minorista', 'minorista', true),
    ('Mayorista', 'mayorista', false)
) as price_list(name, code, is_default)
on conflict (tenant_id, code) do update
  set name = excluded.name,
      is_default = excluded.is_default,
      is_active = excluded.is_active;

with tenant_row as (
  select id from public.tenants where slug = 'rb-distribuidora'
)
insert into public.brands (
  tenant_id,
  external_id,
  name,
  slug,
  price_adjustment_percent,
  is_controlled_placeholder,
  is_active
)
select
  tenant_row.id,
  brand.external_id,
  brand.name,
  brand.slug,
  0,
  brand.is_controlled_placeholder,
  true
from tenant_row
cross join (
  values
    ('MAR008', 'Sin marca', 'sin-marca', true)
) as brand(external_id, name, slug, is_controlled_placeholder)
on conflict (tenant_id, external_id) do update
  set name = excluded.name,
      slug = excluded.slug,
      price_adjustment_percent = excluded.price_adjustment_percent,
      is_controlled_placeholder = excluded.is_controlled_placeholder,
      is_active = excluded.is_active;

with tenant_row as (
  select id from public.tenants where slug = 'rb-distribuidora'
)
insert into public.categories (
  tenant_id,
  external_id,
  name,
  slug,
  sort_order,
  is_active
)
select
  tenant_row.id,
  category.external_id,
  category.name,
  category.slug,
  category.sort_order,
  true
from tenant_row
cross join (
  values
    ('CAT001', 'Sahumerios e inciensos', 'sahumerios-e-inciensos', 10),
    ('CAT002', 'Aromatizantes y difusores', 'aromatizantes-y-difusores', 20),
    ('CAT003', 'Esencias y armonizadores', 'esencias-y-armonizadores', 30),
    ('CAT004', 'Limpieza y hogar', 'limpieza-y-hogar', 40),
    ('CAT005', 'Porta sahumerios y accesorios', 'porta-sahumerios-y-accesorios', 50),
    ('CAT006', 'Velas', 'velas', 60)
) as category(external_id, name, slug, sort_order)
on conflict (tenant_id, external_id) do update
  set name = excluded.name,
      slug = excluded.slug,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active;
