import { supabaseServer } from '@/lib/supabaseServer';
import { mapTenantRowToListItem } from './mapper';
import type { TenantCountErrors, TenantCounts, TenantListResult, TenantRow } from './types';

export async function listTenants(): Promise<TenantListResult> {
  const tenants = await readTenantRows();

  if (tenants.error) {
    return {
      tenants: [],
      error: tenants.error,
    };
  }

  const rows = tenants.rows;
  const countResults = await Promise.all(rows.map((row) => getTenantCounts(row.id)));
  const tenantsList = rows.map((row, index) =>
    mapTenantRowToListItem(row, countResults[index].counts),
  );
  const errors = [
    tenants.warning,
    ...countResults.flatMap((result) => Object.values(result.errors)),
  ].filter((error): error is string => Boolean(error));

  return {
    tenants: tenantsList,
    error: errors.length > 0 ? [...new Set(errors)].join(' ') : null,
  };
}

export async function tenantSlugExists(slug: string) {
  const { data, error } = await supabaseServer
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    return {
      exists: false,
      error: error.message,
    };
  }

  return {
    exists: Boolean(data),
    error: null,
  };
}

async function readTenantRows(): Promise<{
  rows: TenantRow[];
  error: string | null;
  warning: string | null;
}> {
  const fullQuery = await supabaseServer
    .from('tenants')
    .select('id, name, slug, status, logo_url, primary_color, secondary_color, created_at')
    .order('created_at', { ascending: false });

  if (!fullQuery.error) {
    return {
      rows: (fullQuery.data ?? []) as TenantRow[],
      error: null,
      warning: null,
    };
  }

  const shouldFallback =
    fullQuery.error.message.includes('logo_url') ||
    fullQuery.error.message.includes('primary_color') ||
    fullQuery.error.message.includes('secondary_color');

  if (!shouldFallback) {
    return {
      rows: [],
      error: fullQuery.error.message,
      warning: null,
    };
  }

  const baseQuery = await supabaseServer
    .from('tenants')
    .select('id, name, slug, status, created_at')
    .order('created_at', { ascending: false });

  if (baseQuery.error) {
    return {
      rows: [],
      error: baseQuery.error.message,
      warning: null,
    };
  }

  return {
    rows: (baseQuery.data ?? []) as TenantRow[],
    error: null,
    warning: 'Faltan columnas de tenant settings. Ejecuta 003_tenant_settings.sql para habilitar branding, settings y feature flags.',
  };
}

async function getTenantCounts(tenantId: string): Promise<{
  counts: TenantCounts;
  errors: TenantCountErrors;
}> {
  const [products, accounts, sales] = await Promise.all([
    countRows('products', tenantId),
    countRows('customer_accounts', tenantId),
    countRows('sales_orders', tenantId),
  ]);

  return {
    counts: {
      products: products.count,
      accounts: accounts.count,
      sales: sales.count,
    },
    errors: {
      products: products.error ?? undefined,
      accounts: accounts.error ?? undefined,
      sales: sales.error ?? undefined,
    },
  };
}

async function countRows(table: string, tenantId: string) {
  const { count, error } = await supabaseServer
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  return {
    count: error ? null : count ?? 0,
    error: error?.message ?? null,
  };
}
