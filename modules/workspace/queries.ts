import { supabaseServer } from '@/lib/supabaseServer';
import { getTenantIdentity } from '@/modules/tenant/queries';
import { mapAuditLogRowToActivity } from './mapper';
import type {
  AuditLogRow,
  CommercialWorkspace,
  CountResult,
  WorkspaceMetric,
  WorkspaceSidebarIndicators,
  WorkspaceTenant,
} from './types';

type EqualityFilter = {
  field: string;
  value: string | boolean | number;
};

const EMPTY_INDICATORS: WorkspaceSidebarIndicators = {
  products: null,
  accounts: null,
  sales: null,
};

export async function getCommercialWorkspace(tenantSlug: string): Promise<CommercialWorkspace> {
  const tenantResult = await getTenantIdentity(tenantSlug);

  if (tenantResult.error || !tenantResult.tenant) {
    return emptyWorkspace(tenantResult.error ?? `No se encontro el tenant ${tenantSlug}.`);
  }

  const tenant = tenantResult.tenant;
  const tenantId = tenant.id;
  const [
    products,
    accounts,
    sales,
    categories,
    brands,
    salesDraft,
    salesPending,
    productsWithoutPrice,
    accountsWithoutPriceList,
    activity,
  ] = await Promise.all([
    countRows('products', tenantId, [{ field: 'is_active', value: true }]),
    countRows('customer_accounts', tenantId, [{ field: 'status', value: 'active' }]),
    countRows('sales_orders', tenantId),
    countRows('categories', tenantId, [{ field: 'is_active', value: true }]),
    countRows('brands', tenantId, [{ field: 'is_active', value: true }]),
    countRows('sales_orders', tenantId, [{ field: 'status', value: 'draft' }]),
    countRows('sales_orders', tenantId, [{ field: 'status', value: 'pending' }]),
    countActiveProductsWithoutPrice(tenantId),
    countActiveAccountsWithoutPriceList(tenantId),
    getRecentActivity(tenantId),
  ]);

  const pending = buildPendingMetrics({
    salesDraft,
    salesPending,
    productsWithoutPrice,
    accountsWithoutPriceList,
  });
  const summary = buildSummaryMetrics({
    products,
    accounts,
    sales,
    categories,
    brands,
  });

  return {
    tenant,
    summary,
    pending,
    activity: activity.activity,
    activityError: activity.error,
    sidebarIndicators: {
      products: productsWithoutPrice.count,
      accounts: accountsWithoutPriceList.count,
      sales: salesPending.count,
    },
    errors: [
      ...summary.map((metric) => metric.error),
      ...pending.map((metric) => metric.error),
      activity.error,
    ].filter((error): error is string => Boolean(error)),
  };
}

export async function getWorkspaceSidebarIndicators(
  tenantSlug: string,
): Promise<WorkspaceSidebarIndicators> {
  const tenantResult = await getTenantIdentity(tenantSlug);

  if (tenantResult.error || !tenantResult.tenant) {
    return EMPTY_INDICATORS;
  }

  const tenantId = tenantResult.tenant.id;
  const [salesPending, productsWithoutPrice, accountsWithoutPriceList] = await Promise.all([
    countRows('sales_orders', tenantId, [{ field: 'status', value: 'pending' }]),
    countActiveProductsWithoutPrice(tenantId),
    countActiveAccountsWithoutPriceList(tenantId),
  ]);

  return {
    products: productsWithoutPrice.count,
    accounts: accountsWithoutPriceList.count,
    sales: salesPending.count,
  };
}

async function countRows(
  table: string,
  tenantId: string,
  filters: EqualityFilter[] = [],
): Promise<CountResult> {
  let query = supabaseServer
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  for (const filter of filters) {
    query = query.eq(filter.field, filter.value);
  }

  const { count, error } = await query;

  return {
    count: error ? null : count ?? 0,
    error: error?.message ?? null,
  };
}

async function countActiveProductsWithoutPrice(tenantId: string): Promise<CountResult> {
  const { data, error } = await supabaseServer
    .from('products')
    .select('id, product_prices(id)')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (error) {
    return {
      count: null,
      error: error.message,
    };
  }

  const count = (data ?? []).filter((product) => {
    const prices = product.product_prices;

    return !Array.isArray(prices) || prices.length === 0;
  }).length;

  return {
    count,
    error: null,
  };
}

async function countActiveAccountsWithoutPriceList(tenantId: string): Promise<CountResult> {
  const { count, error } = await supabaseServer
    .from('customer_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .is('price_list_id', null);

  return {
    count: error ? null : count ?? 0,
    error: error?.message ?? null,
  };
}

async function getRecentActivity(tenantId: string): Promise<{
  activity: CommercialWorkspace['activity'];
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('audit_logs')
    .select('id, actor_name, entity_type, entity_id, action, metadata_json, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return {
      activity: [],
      error: error.message,
    };
  }

  return {
    activity: ((data ?? []) as AuditLogRow[]).map(mapAuditLogRowToActivity),
    error: null,
  };
}

function buildSummaryMetrics(counts: {
  products: CountResult;
  accounts: CountResult;
  sales: CountResult;
  categories: CountResult;
  brands: CountResult;
}): WorkspaceMetric[] {
  return [
    {
      key: 'products',
      label: 'Productos',
      value: counts.products.count,
      description: 'Productos activos publicados',
      href: '/admin/productos',
      error: counts.products.error,
    },
    {
      key: 'accounts',
      label: 'Accounts',
      value: counts.accounts.count,
      description: 'Cuentas comerciales activas',
      href: '/admin/accounts',
      error: counts.accounts.error,
    },
    {
      key: 'sales',
      label: 'Pedidos',
      value: counts.sales.count,
      description: 'Pedidos comerciales registrados',
      href: '/admin/sales',
      error: counts.sales.error,
    },
    {
      key: 'categories',
      label: 'Categorias',
      value: counts.categories.count,
      description: 'Categorias activas del catalogo',
      href: '/admin/categorias',
      error: counts.categories.error,
    },
    {
      key: 'brands',
      label: 'Marcas',
      value: counts.brands.count,
      description: 'Marcas activas disponibles',
      href: '/admin/marcas',
      error: counts.brands.error,
    },
  ];
}

function buildPendingMetrics(counts: {
  salesDraft: CountResult;
  salesPending: CountResult;
  productsWithoutPrice: CountResult;
  accountsWithoutPriceList: CountResult;
}): WorkspaceMetric[] {
  return [
    {
      key: 'salesDraft',
      label: 'Pedidos en borrador',
      value: counts.salesDraft.count,
      description: 'Pedidos iniciados que todavia necesitan revision',
      href: '/admin/sales?status=draft',
      error: counts.salesDraft.error,
    },
    {
      key: 'salesPending',
      label: 'Pedidos pendientes',
      value: counts.salesPending.count,
      description: 'Pedidos esperando confirmacion o siguiente accion',
      href: '/admin/sales?status=pending',
      error: counts.salesPending.error,
    },
    {
      key: 'productsWithoutPrice',
      label: 'Productos sin precio',
      value: counts.productsWithoutPrice.count,
      description: 'Productos activos sin lista de precios asociada',
      href: '/admin/precios',
      error: counts.productsWithoutPrice.error,
    },
    {
      key: 'accountsWithoutPriceList',
      label: 'Accounts sin lista',
      value: counts.accountsWithoutPriceList.count,
      description: 'Accounts activas sin lista de precios definida',
      href: '/admin/accounts',
      error: counts.accountsWithoutPriceList.error,
    },
  ];
}

function emptyWorkspace(error: string): CommercialWorkspace {
  return {
    tenant: null,
    summary: [],
    pending: [],
    activity: [],
    activityError: error,
    sidebarIndicators: EMPTY_INDICATORS,
    errors: [error],
  };
}
