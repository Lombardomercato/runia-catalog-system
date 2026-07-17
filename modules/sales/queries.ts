import { supabaseServer } from '@/lib/supabaseServer';
import { getTenantIdentity } from '@/modules/tenant/queries';
import {
  mapSalesOrderRowToDetail,
  mapSalesOrderRowToListItem,
  mapSalesProductRowToOption,
} from './mapper';
import type {
  SalesAccountOption,
  SalesDraftOptions,
  SalesDraftOptionsResult,
  SalesListParams,
  SalesOrderDetailResult,
  SalesOrderAuditRow,
  SalesOrderListResult,
  SalesOrderQueryRow,
  SalesPaginationState,
  SalesPriceListOption,
  SalesProductQueryRow,
} from './types';

const SALES_ORDER_SELECT = `
  id,
  account_id,
  status,
  price_list_id,
  subtotal,
  discount,
  total,
  notes,
  metadata_json,
  source,
  currency,
  identity_snapshot_json,
  commercial_snapshot_json,
  created_at,
  updated_at,
  customer_accounts:account_id(id, name, legal_name, email, tax_id, whatsapp_phone),
  price_lists:price_list_id(id, name),
  sales_order_items(
    id,
    product_id,
    sku_snapshot,
    product_name_snapshot,
    variant_snapshot,
    unit_price_snapshot,
    quantity,
    subtotal,
    currency_snapshot,
    product_snapshot_json
  )
`;

const SALES_ORDER_LIST_SELECT = `
  id,
  account_id,
  status,
  price_list_id,
  subtotal,
  discount,
  total,
  metadata_json,
  source,
  currency,
  identity_snapshot_json,
  commercial_snapshot_json,
  created_at,
  updated_at,
  customer_accounts:account_id(name),
  price_lists:price_list_id(name),
  sales_order_items(
    id,
    sku_snapshot,
    product_name_snapshot,
    variant_snapshot
  )
`;

const SALES_PRODUCT_SELECT = `
  id,
  sku,
  name,
  variant,
  product_line,
  brands:brand_id(name),
  product_prices(
    price_list_id,
    price,
    currency
  )
`;

const EMPTY_PAGINATION: SalesPaginationState = {
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 1,
  hasPrevious: false,
  hasNext: false,
};

export async function listSalesOrders(
  tenantSlug: string,
  params: SalesListParams,
): Promise<SalesOrderListResult> {
  const tenantResult = await getTenantIdentity(tenantSlug);

  if (tenantResult.error || !tenantResult.tenant) {
    return emptySalesOrderList(params, tenantResult.error);
  }

  let query = supabaseServer
    .from('sales_orders')
    .select(SALES_ORDER_LIST_SELECT, { count: 'exact' })
    .eq('tenant_id', tenantResult.tenant.id);

  if (params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const search = normalizeSearchTerm(params.search);
  const start = (params.page - 1) * params.pageSize;
  const end = start + params.pageSize - 1;
  const pagedQuery = search ? query : query.range(start, end);
  const { data, error, count } = await pagedQuery.order('updated_at', { ascending: false });

  if (error) {
    return emptySalesOrderList(params, error.message);
  }

  let orders = ((data ?? []) as SalesOrderQueryRow[]).map(mapSalesOrderRowToListItem);

  if (search) {
    orders = orders.filter((order) =>
      [order.id, order.accountName, order.priceListName]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase()),
    );

    return {
      orders: orders.slice(start, start + params.pageSize),
      pagination: buildPagination(orders.length, params.page, params.pageSize),
      error: null,
    };
  }

  return {
    orders,
    pagination: buildPagination(count ?? orders.length, params.page, params.pageSize),
    error: null,
  };
}

export async function getSalesOrderById(
  tenantSlug: string,
  orderId: string,
): Promise<SalesOrderDetailResult> {
  const tenantResult = await getTenantIdentity(tenantSlug);

  if (tenantResult.error || !tenantResult.tenant) {
    return {
      order: null,
      error: tenantResult.error,
    };
  }

  const { data, error } = await supabaseServer
    .from('sales_orders')
    .select(SALES_ORDER_SELECT)
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('id', orderId)
    .single();

  if (error || !data) {
    return {
      order: null,
      error: 'No se encontro el pedido solicitado.',
    };
  }

  const { data: auditData } = await supabaseServer
    .from('audit_logs')
    .select('id, action, before_json, after_json, created_at')
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('entity_type', 'sales_order')
    .eq('entity_id', orderId)
    .order('created_at', { ascending: true });

  return {
    order: mapSalesOrderRowToDetail(
      data as SalesOrderQueryRow,
      tenantResult.tenant.name,
      tenantResult.tenant.currency,
      (auditData ?? []) as SalesOrderAuditRow[],
    ),
    error: null,
  };
}

export async function getSalesDraftOptions(tenantSlug: string): Promise<SalesDraftOptionsResult> {
  const emptyOptions = emptyDraftOptions();
  const tenantResult = await getTenantIdentity(tenantSlug);

  if (tenantResult.error || !tenantResult.tenant) {
    return {
      options: emptyOptions,
      error: tenantResult.error,
    };
  }

  const tenantId = tenantResult.tenant.id;
  const [accounts, priceLists, products] = await Promise.all([
    getSalesAccounts(tenantId),
    getSalesPriceLists(tenantId),
    getSalesProducts(tenantId),
  ]);
  const firstError = accounts.error ?? priceLists.error ?? products.error;

  return {
    options: {
      accounts: accounts.accounts,
      priceLists: priceLists.priceLists,
      products: products.products,
    },
    error: firstError,
  };
}

async function getSalesAccounts(tenantId: string): Promise<{
  accounts: SalesAccountOption[];
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('customer_accounts')
    .select('id, name, legal_name, price_list_id, discount_percent, price_lists:price_list_id(id, name)')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('name', { ascending: true });

  if (error) {
    return {
      accounts: [],
      error: error.message,
    };
  }

  return {
    accounts: (data ?? []).map((account) => {
      const priceList = Array.isArray(account.price_lists)
        ? account.price_lists[0]
        : account.price_lists;

      return {
        id: account.id,
        name: account.name,
        legalName: account.legal_name,
        priceListId: account.price_list_id,
        priceListName: priceList?.name ?? null,
        discountPercent: toNumber(account.discount_percent) ?? 0,
      };
    }),
    error: null,
  };
}

async function getSalesPriceLists(tenantId: string): Promise<{
  priceLists: SalesPriceListOption[];
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('price_lists')
    .select('id, code, name, is_default')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    return {
      priceLists: [],
      error: error.message,
    };
  }

  return {
    priceLists: (data ?? []).map((priceList) => ({
      id: priceList.id,
      code: priceList.code,
      name: priceList.name,
      isDefault: priceList.is_default,
    })),
    error: null,
  };
}

async function getSalesProducts(tenantId: string): Promise<{
  products: SalesDraftOptions['products'];
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('products')
    .select(SALES_PRODUCT_SELECT)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    return {
      products: [],
      error: error.message,
    };
  }

  return {
    products: ((data ?? []) as SalesProductQueryRow[]).map(mapSalesProductRowToOption),
    error: null,
  };
}

function emptyDraftOptions(): SalesDraftOptions {
  return {
    accounts: [],
    priceLists: [],
    products: [],
  };
}

function emptySalesOrderList(params: SalesListParams, error: string | null): SalesOrderListResult {
  return {
    orders: [],
    pagination: {
      ...EMPTY_PAGINATION,
      page: params.page,
      pageSize: params.pageSize,
    },
    error,
  };
}

function buildPagination(total: number, requestedPage: number, pageSize: number): SalesPaginationState {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), totalPages);

  return {
    page,
    pageSize,
    total,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

function normalizeSearchTerm(value: string) {
  return value.trim().replace(/[%,()_]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}
