-- Run after migrations 001..011 in a disposable/local database.
-- Every cross-tenant insert below must fail with foreign_key_violation.
-- The transaction is always rolled back and does not retain fixtures.

begin;

do $$
declare
  rb_tenant uuid := gen_random_uuid();
  other_tenant uuid := gen_random_uuid();
  rb_category uuid := gen_random_uuid();
  other_category uuid := gen_random_uuid();
  rb_brand uuid := gen_random_uuid();
  other_brand uuid := gen_random_uuid();
  rb_product uuid := gen_random_uuid();
  other_product uuid := gen_random_uuid();
  rb_list uuid := gen_random_uuid();
  other_list uuid := gen_random_uuid();
  rb_account uuid := gen_random_uuid();
  other_account uuid := gen_random_uuid();
  other_order uuid := gen_random_uuid();
begin
  insert into public.tenants (id, name, slug, status)
  values
    (rb_tenant, 'Isolation RB fixture', 'isolation-rb', 'active'),
    (other_tenant, 'Isolation other fixture', 'isolation-other', 'active');

  insert into public.categories (id, tenant_id, external_id, name)
  values
    (rb_category, rb_tenant, 'isolation-rb-category', 'RB category'),
    (other_category, other_tenant, 'isolation-other-category', 'Other category');

  insert into public.brands (id, tenant_id, external_id, name)
  values
    (rb_brand, rb_tenant, 'isolation-rb-brand', 'RB brand'),
    (other_brand, other_tenant, 'isolation-other-brand', 'Other brand');

  insert into public.price_lists (id, tenant_id, name, code, is_default)
  values
    (rb_list, rb_tenant, 'RB list', 'isolation-rb', true),
    (other_list, other_tenant, 'Other list', 'isolation-other', true);

  -- Positive control: a normal RB product must still work.
  insert into public.products (id, tenant_id, sku, category_id, brand_id, name)
  values (rb_product, rb_tenant, 'ISOLATION-RB-PRODUCT', rb_category, rb_brand, 'RB product');

  insert into public.products (id, tenant_id, sku, category_id, brand_id, name)
  values (other_product, other_tenant, 'ISOLATION-OTHER-PRODUCT', other_category, other_brand, 'Other product');

  insert into public.customer_accounts (id, tenant_id, name, price_list_id)
  values
    (rb_account, rb_tenant, 'RB account', rb_list),
    (other_account, other_tenant, 'Other account', other_list);

  insert into public.sales_orders (
    id, tenant_id, account_id, status, price_list_id, subtotal, discount, total
  ) values (
    other_order, other_tenant, other_account, 'draft', other_list, 0, 0, 0
  );

  begin
    insert into public.products (tenant_id, sku, category_id, brand_id, name)
    values (other_tenant, 'CROSS-CATEGORY', rb_category, other_brand, 'Must fail');
    raise exception 'ISOLATION_TEST_FAILED: product accepted a category from another tenant';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.products (tenant_id, sku, category_id, brand_id, name)
    values (other_tenant, 'CROSS-BRAND', other_category, rb_brand, 'Must fail');
    raise exception 'ISOLATION_TEST_FAILED: product accepted a brand from another tenant';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.product_prices (tenant_id, product_id, price_list_id, price)
    values (other_tenant, rb_product, other_list, 1);
    raise exception 'ISOLATION_TEST_FAILED: price accepted a product from another tenant';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.product_prices (tenant_id, product_id, price_list_id, price)
    values (other_tenant, other_product, rb_list, 1);
    raise exception 'ISOLATION_TEST_FAILED: price accepted a price list from another tenant';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.sales_order_items (
      tenant_id, order_id, product_id, sku_snapshot, product_name_snapshot,
      unit_price_snapshot, quantity, subtotal
    ) values (
      other_tenant, other_order, rb_product, 'CROSS-ORDER-PRODUCT', 'Must fail',
      1, 1, 1
    );
    raise exception 'ISOLATION_TEST_FAILED: order accepted a product from another tenant';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.customer_accounts (tenant_id, name, price_list_id)
    values (other_tenant, 'Must fail', rb_list);
    raise exception 'ISOLATION_TEST_FAILED: account accepted a price list from another tenant';
  exception when foreign_key_violation then null;
  end;
end $$;

rollback;
