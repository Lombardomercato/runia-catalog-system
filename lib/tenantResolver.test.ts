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
