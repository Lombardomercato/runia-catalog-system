import { supabaseServer } from '@/lib/supabaseServer';
import { getTenantIdentity } from '@/modules/tenant/queries';
import {
  WORKSPACE_ACTIVITY_ACTIONS,
  isWorkspaceActivity,
  mapAuditLogRowToActivity,
  mapRecentOrderRow,
} from './mapper';
import type {
  AuditLogRow,
  CommercialWorkspace,
  CountResult,
  WorkspaceMetric,
  WorkspaceRecentOrderRow,
  WorkspaceSalesRow,
  WorkspaceSidebarIndicators,
} from './types';

type EqualityFilter = { field: string; value: string | boolean | number };

const EMPTY_INDICATORS: WorkspaceSidebarIndicators = {
  products: null,
  accounts: null,
  sales: null,
};
const REVENUE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'delivered', 'closed']);
const SALES_PAGE_SIZE = 1000;

export async function getCommercialWorkspace(tenantSlug: string): Promise<CommercialWorkspace> {
  const tenantResult = await getTenantIdentity(tenantSlug);
  if (tenantResult.error || !tenantResult.tenant) {
    return emptyWorkspace(tenantResult.error ?? `No se encontro el tenant ${tenantSlug}.`);
  }

  const tenant = tenantResult.tenant;
  const [sales, recentOrders, activity] = await Promise.all([
    getAllSalesRows(tenant.id),
    getRecentOrders(tenant.id),
    getRecentActivity(tenant.id),
  ]);
  const metrics = buildCommercialMetrics(sales.rows, tenant.currency, sales.error);
  const pending = buildPendingMetrics(sales.rows, sales.error);
  const errors = [...new Set([
    sales.error,
    recentOrders.error,
    activity.error,
  ].filter((error): error is string => Boolean(error)))];

  return {
    tenant,
    summary: metrics,
    pending,
    recentOrders: recentOrders.orders,
    recentOrdersError: recentOrders.error,
    activity: activity.activity,
    activityError: activity.error,
    sidebarIndicators: {
      products: null,
      accounts: null,
      sales: sales.error ? null : countStatus(sales.rows, 'pending'),
    },
    errors,
  };
}

export async function getWorkspaceSidebarIndicators(
  tenantSlug: string,
): Promise<WorkspaceSidebarIndicators> {
  const tenantResult = await getTenantIdentity(tenantSlug);
  if (tenantResult.error || !tenantResult.tenant) return EMPTY_INDICATORS;
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

async function getAllSalesRows(tenantId: string): Promise<{
  rows: WorkspaceSalesRow[];
  error: string | null;
}> {
  const rows: WorkspaceSalesRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseServer
      .from('sales_orders')
      .select('id, status, total, currency, created_at')
      .eq('tenant_id', tenantId)
      .order('id', { ascending: true })
      .range(offset, offset + SALES_PAGE_SIZE - 1);
    if (error) return { rows: [], error: error.message };
    const page = (data ?? []) as WorkspaceSalesRow[];
    rows.push(...page);
    if (page.length < SALES_PAGE_SIZE) break;
    offset += SALES_PAGE_SIZE;
  }
  return { rows, error: null };
}

async function getRecentOrders(tenantId: string): Promise<{
  orders: CommercialWorkspace['recentOrders'];
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('sales_orders')
    .select(`
      id,
      account_id,
      status,
      total,
      currency,
      created_at,
      identity_snapshot_json,
      customer_accounts:account_id(name)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(5);
  return error
    ? { orders: [], error: error.message }
    : { orders: ((data ?? []) as WorkspaceRecentOrderRow[]).map(mapRecentOrderRow), error: null };
}

async function getRecentActivity(tenantId: string): Promise<{
  activity: CommercialWorkspace['activity'];
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('audit_logs')
    .select('id, actor_name, entity_type, entity_id, action, before_json, after_json, created_at')
    .eq('tenant_id', tenantId)
    .in('action', [...WORKSPACE_ACTIVITY_ACTIONS])
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return { activity: [], error: error.message };
  const activity = ((data ?? []) as AuditLogRow[])
    .filter(isWorkspaceActivity)
    .slice(0, 20)
    .map(mapAuditLogRowToActivity);
  return { activity, error: null };
}

function buildCommercialMetrics(
  rows: WorkspaceSalesRow[],
  currency: string,
  error: string | null,
): WorkspaceMetric[] {
  const revenueRows = rows.filter((row) => REVENUE_STATUSES.has(row.status));
  const normalizedCurrency = normalizeCurrency(currency);
  const hasMixedCurrency = revenueRows.some(
    (row) => normalizeCurrency(row.currency ?? normalizedCurrency) !== normalizedCurrency,
  );
  const moneyError = error ?? (hasMixedCurrency ? 'Hay pedidos en multiples monedas.' : null);
  const totalSales = moneyError ? null : roundMoney(revenueRows.reduce((sum, row) => sum + numberValue(row.total), 0));
  const averageTicket = totalSales === null || revenueRows.length === 0
    ? totalSales === null ? null : 0
    : roundMoney(totalSales / revenueRows.length);
  const todayStart = argentinaDayStart(0).getTime();
  const sevenDaysStart = argentinaDayStart(6).getTime();
  const metric = (
    key: WorkspaceMetric['key'],
    label: string,
    value: number | null,
    description: string,
    href: string,
    format: WorkspaceMetric['format'] = 'count',
    metricError: string | null = error,
  ): WorkspaceMetric => ({ key, label, value, description, href, format, error: metricError });

  return [
    metric('salesPending', 'Pedidos pendientes', valueOrNull(countStatus(rows, 'pending'), error), 'Esperando confirmacion', '/admin/sales?status=pending'),
    metric('salesConfirmed', 'Pedidos confirmados', valueOrNull(countStatus(rows, 'confirmed'), error), 'Listos para preparar', '/admin/sales?status=confirmed'),
    metric('salesPreparing', 'En preparacion', valueOrNull(countStatus(rows, 'preparing'), error), 'Pedidos en proceso', '/admin/sales?status=preparing'),
    metric('totalSales', 'Ventas totales', totalSales, 'Excluye borradores y cancelados', '/admin/sales', 'currency', moneyError),
    metric('averageTicket', 'Ticket promedio', averageTicket, 'Promedio de pedidos comerciales', '/admin/sales', 'currency', moneyError),
    metric('ordersToday', 'Pedidos del dia', error ? null : countCreatedSince(rows, todayStart), 'Registros creados hoy', '/admin/sales'),
    metric('ordersLast7Days', 'Ultimos 7 dias', error ? null : countCreatedSince(rows, sevenDaysStart), 'Pedidos creados recientemente', '/admin/sales'),
  ];
}

function buildPendingMetrics(rows: WorkspaceSalesRow[], error: string | null): WorkspaceMetric[] {
  const metric = (
    key: WorkspaceMetric['key'],
    label: string,
    status: string,
    description: string,
  ): WorkspaceMetric => ({
    key,
    label,
    value: error ? null : countStatus(rows, status),
    description,
    href: `/admin/sales?status=${status}`,
    error,
    format: 'count',
  });
  return [
    metric('pendingConfirmation', 'Pendientes de confirmar', 'pending', 'Requieren revision comercial'),
    metric('pendingPreparing', 'Pedidos en preparacion', 'preparing', 'Requieren seguimiento operativo'),
    metric('deliveredNotClosed', 'Entregados sin cerrar', 'delivered', 'Falta completar el cierre'),
  ];
}

async function countRows(table: string, tenantId: string, filters: EqualityFilter[] = []): Promise<CountResult> {
  let query = supabaseServer.from(table).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  for (const filter of filters) query = query.eq(filter.field, filter.value);
  const { count, error } = await query;
  return { count: error ? null : count ?? 0, error: error?.message ?? null };
}

async function countActiveProductsWithoutPrice(tenantId: string): Promise<CountResult> {
  const { data, error } = await supabaseServer
    .from('products')
    .select('id, product_prices(id)')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);
  if (error) return { count: null, error: error.message };
  return {
    count: (data ?? []).filter((product) => !Array.isArray(product.product_prices) || product.product_prices.length === 0).length,
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
  return { count: error ? null : count ?? 0, error: error?.message ?? null };
}

function countStatus(rows: WorkspaceSalesRow[], status: string) {
  return rows.filter((row) => row.status === status).length;
}

function countCreatedSince(rows: WorkspaceSalesRow[], timestamp: number) {
  return rows.filter((row) => new Date(row.created_at).getTime() >= timestamp).length;
}

function argentinaDayStart(daysAgo: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day') - daysAgo, 3));
}

function valueOrNull(value: number, error: string | null) {
  return error ? null : value;
}

function numberValue(value: number | string | null) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : 'ARS';
}

function emptyWorkspace(error: string): CommercialWorkspace {
  return {
    tenant: null,
    summary: [],
    pending: [],
    recentOrders: [],
    recentOrdersError: error,
    activity: [],
    activityError: error,
    sidebarIndicators: EMPTY_INDICATORS,
    errors: [error],
  };
}
