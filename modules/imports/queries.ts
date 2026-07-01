import { supabaseServer } from '@/lib/supabaseServer';
import { getTenantIdentity } from '@/modules/tenant/queries';
import { mapImportHistoryRow } from './mapper';
import type {
  ExistingImportState,
  ImportHistoryResult,
  ImportTenant,
} from './types';

export async function getImportContext(tenantSlug: string): Promise<{
  tenant: ImportTenant | null;
  existing: ExistingImportState | null;
  error: string | null;
}> {
  const tenantResult = await getTenantIdentity(tenantSlug);
  if (tenantResult.error || !tenantResult.tenant) {
    return { tenant: null, existing: null, error: tenantResult.error ?? 'No se encontro el tenant.' };
  }

  const tenant = {
    id: tenantResult.tenant.id,
    name: tenantResult.tenant.name,
    slug: tenantResult.tenant.slug,
  };
  const [categories, brands, products, prices, priceLists] = await Promise.all([
    readExternalIds('categories', tenant.id),
    readExternalIds('brands', tenant.id),
    readProducts(tenant.id),
    readPrices(tenant.id),
    readPriceLists(tenant.id),
  ]);
  const error = categories.error ?? brands.error ?? products.error ?? prices.error ?? priceLists.error;
  if (error) return { tenant, existing: null, error };

  return {
    tenant,
    existing: {
      categoriesByExternalId: categories.values,
      brandsByExternalId: brands.values,
      productsBySku: products.values,
      pricesByProductAndList: prices.values,
      priceListsByCode: priceLists.values,
    },
    error: null,
  };
}

export async function listRecentImports(tenantSlug: string, limit = 10): Promise<ImportHistoryResult> {
  const tenantResult = await getTenantIdentity(tenantSlug);
  if (tenantResult.error || !tenantResult.tenant) {
    return { imports: [], error: tenantResult.error ?? 'No se encontro el tenant.' };
  }

  const { data, error } = await supabaseServer
    .from('import_batches')
    .select('id, source_name, status, started_at, finished_at, summary_json, created_at')
    .eq('tenant_id', tenantResult.tenant.id)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 20));

  return {
    imports: error ? [] : (data ?? []).map((row) => mapImportHistoryRow(row)),
    error: error?.message ?? null,
  };
}

async function readExternalIds(table: 'categories' | 'brands', tenantId: string) {
  const { data, error } = await supabaseServer.from(table).select('id, external_id').eq('tenant_id', tenantId);
  return {
    values: new Map((data ?? []).filter((row) => row.external_id).map((row) => [String(row.external_id), String(row.id)])),
    error: error ? `No se pudo leer ${table}: ${error.message}` : null,
  };
}

async function readProducts(tenantId: string) {
  const { data, error } = await supabaseServer.from('products').select('id, sku').eq('tenant_id', tenantId);
  return {
    values: new Map((data ?? []).map((row) => [String(row.sku), String(row.id)])),
    error: error ? `No se pudo leer products: ${error.message}` : null,
  };
}

async function readPrices(tenantId: string) {
  const { data, error } = await supabaseServer.from('product_prices').select('product_id, price_list_id').eq('tenant_id', tenantId);
  return {
    values: new Set((data ?? []).map((row) => `${row.product_id}:${row.price_list_id}`)),
    error: error ? `No se pudo leer product_prices: ${error.message}` : null,
  };
}

async function readPriceLists(tenantId: string) {
  const { data, error } = await supabaseServer.from('price_lists').select('id, code').eq('tenant_id', tenantId);
  return {
    values: new Map((data ?? []).map((row) => [String(row.code), String(row.id)])),
    error: error ? `No se pudo leer price_lists: ${error.message}` : null,
  };
}
