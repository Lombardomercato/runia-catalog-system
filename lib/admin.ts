import { supabaseServer } from './supabaseServer';
import { countActiveProductsByTenantId } from '@/modules/products/queries';
import { getTenantIdentity } from '@/modules/tenant/queries';

export type AdminDashboardStats = {
  products: number;
  categories: number;
  brands: number;
  orders: number;
};

export async function getAdminDashboardStats(tenantSlug: string) {
  const tenantResult = await getTenantIdentity(tenantSlug);

  if (tenantResult.error || !tenantResult.tenant) {
    return {
      stats: null,
      error: tenantResult.error,
    };
  }

  const tenant = tenantResult.tenant;

  const [products, categories, brands, orders] = await Promise.all([
    countActiveProductsByTenantId(tenant.id),
    countRows('categories', tenant.id, { is_active: true }),
    countRows('brands', tenant.id, { is_active: true }),
    countRows('orders', tenant.id),
  ]);

  const firstError = [products.error, categories.error, brands.error, orders.error].find(Boolean);

  if (firstError) {
    return {
      stats: null,
      error: firstError,
    };
  }

  return {
    stats: {
      products: products.count,
      categories: categories.count,
      brands: brands.count,
      orders: orders.count,
    },
    error: null,
  };
}

async function countRows(
  table: 'categories' | 'brands' | 'orders',
  tenantId: string,
  filters: Partial<{ is_active: boolean }> = {},
) {
  let query = supabaseServer
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (typeof filters.is_active === 'boolean') {
    query = query.eq('is_active', filters.is_active);
  }

  const { count, error } = await query;

  return {
    count: count ?? 0,
    error: error?.message ?? null,
  };
}
