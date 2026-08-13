import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  normalizeHostname,
  resolveTenantSlug,
} from './tenantResolver';

test('normaliza hostname sin aceptar puerto ni forwarded-host secundarios', () => {
  assert.equal(normalizeHostname('LOMBARDO.COM.AR:443'), 'lombardo.com.ar');
  assert.equal(normalizeHostname('shop.example.com, proxy.internal'), 'shop.example.com');
  assert.equal(normalizeHostname('[::1]:3000'), '[::1]');
});

test('la cookie interna sigue seleccionando el tenant de herramientas Runia', async () => {
  assert.equal(
    await resolveTenantSlug({
      hostname: 'runia.internal',
      surface: 'internal',
      selectedTenantSlug: 'rb-distribuidora',
      fallbackTenantSlug: 'fallback',
      nodeEnv: 'production',
    }),
    'rb-distribuidora',
  );
});

test('localhost permite cookie para desarrollo publico', async () => {
  assert.equal(
    await resolveTenantSlug({
      hostname: 'localhost:3000',
      surface: 'public',
      selectedTenantSlug: 'rb-distribuidora',
      fallbackTenantSlug: 'fallback',
      nodeEnv: 'production',
    }),
    'rb-distribuidora',
  );
});

test('la superficie publica de produccion ignora la cookie seleccionada', async () => {
  assert.equal(
    await resolveTenantSlug({
      hostname: null,
      surface: 'public',
      selectedTenantSlug: 'tenant-elegido-por-cookie',
      fallbackTenantSlug: 'rb-distribuidora',
      nodeEnv: 'production',
    }),
    'rb-distribuidora',
  );
});

test('la migracion cubre las relaciones tenant-owned criticas y cierra acceso directo', async () => {
  const sql = await readFile(
    new URL('../db/migrations/010_tenant_integrity_and_rls.sql', import.meta.url),
    'utf8',
  );
  const constraints = [
    'products_tenant_category_fk',
    'products_tenant_brand_fk',
    'product_prices_tenant_product_fk',
    'product_prices_tenant_price_list_fk',
    'customer_accounts_tenant_price_list_fk',
    'sales_orders_tenant_account_fk',
    'sales_orders_tenant_price_list_fk',
    'sales_order_items_tenant_order_fk',
    'sales_order_items_tenant_product_fk',
    'account_contacts_tenant_account_fk',
    'account_addresses_tenant_account_fk',
  ];
  constraints.forEach((constraint) => assert.match(sql, new RegExp(constraint)));
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table/i);
  assert.match(sql, /to anon using \(false\)/i);
  assert.match(sql, /to authenticated using \(false\)/i);
});

test('existe una prueba SQL transaccional para los seis cruces requeridos', async () => {
  const sql = await readFile(
    new URL('../db/tests/tenant_isolation.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^rollback;/m);
  assert.equal((sql.match(/exception when foreign_key_violation/g) ?? []).length, 6);
  assert.match(sql, /Positive control: a normal RB product must still work/);
});

test('la migracion 013 cierra tablas core sin crear acceso publico', async () => {
  const sql = await readFile(
    new URL('../db/migrations/013_core_legacy_rls_hardening.sql', import.meta.url),
    'utf8',
  );
  const tables = [
    'tenants', 'categories', 'brands', 'products', 'price_lists',
    'product_prices', 'product_images', 'customer_accounts', 'orders',
    'order_items', 'import_batches', 'import_rows',
  ];
  tables.forEach((table) => assert.match(sql, new RegExp(`'${table}'`)));
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.%I from public, anon, authenticated/i);
  assert.match(sql, /server_only_deny_anon/i);
  assert.match(sql, /server_only_deny_authenticated/i);
  assert.match(sql, /update_updated_at_column\(\) set search_path = ''/i);
});

test('commerce es una migracion reusable y permanece server-only', async () => {
  const sql = await readFile(
    new URL('../db/migrations/014_lombardo_commerce_orders.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /create table if not exists public\.commerce_orders/i);
  assert.match(sql, /create table if not exists public\.commerce_payment_events/i);
  assert.match(sql, /payment_method in \('mercado_pago', 'whatsapp_coordination'\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /revoke all on table public\.commerce_orders from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update on table public\.commerce_orders to service_role/i);
});
