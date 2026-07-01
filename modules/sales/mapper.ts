import type {
  SalesOrderDetail,
  SalesOrderItemDetail,
  SalesOrderItemQueryRow,
  SalesOrderListItem,
  SalesOrderQueryRow,
  SalesProductOption,
  SalesProductQueryRow,
  SalesRelation,
  SalesOrderStatus,
} from './types';

const DEFAULT_STATUS: SalesOrderStatus = 'draft';
const DEFAULT_CURRENCY = 'ARS';

export function mapSalesOrderRowToListItem(row: SalesOrderQueryRow): SalesOrderListItem {
  const account = firstRelation(row.customer_accounts);
  const priceList = firstRelation(row.price_lists);

  return {
    id: row.id,
    accountId: row.account_id,
    accountName: account?.name ?? 'Sin account',
    status: normalizeStatus(row.status),
    priceListId: row.price_list_id,
    priceListName: priceList?.name ?? 'Sin lista',
    subtotal: toNumber(row.subtotal) ?? 0,
    discount: toNumber(row.discount) ?? 0,
    total: toNumber(row.total) ?? 0,
    itemsCount: row.sales_order_items?.length ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesOrderRowToDetail(
  row: SalesOrderQueryRow,
  tenantName: string,
  currency: string,
): SalesOrderDetail {
  const listItem = mapSalesOrderRowToListItem(row);
  const account = firstRelation(row.customer_accounts);
  const items = (row.sales_order_items ?? []).map(mapSalesOrderItemRowToDetail);

  return {
    ...listItem,
    tenantName,
    currency,
    accountWhatsapp: account?.whatsapp_phone ?? null,
    notes: row.notes ?? null,
    items: sortItemsByStoredOrder(items, row.metadata_json),
  };
}

export function mapSalesProductRowToOption(row: SalesProductQueryRow): SalesProductOption {
  const brand = firstRelation(row.brands);

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brandName: brand?.name ?? null,
    variant: row.variant,
    productLine: row.product_line,
    prices: (row.product_prices ?? [])
      .filter((price) => price.price_list_id && price.price !== null)
      .map((price) => ({
        priceListId: price.price_list_id ?? '',
        price: toNumber(price.price) ?? 0,
        currency: price.currency ?? DEFAULT_CURRENCY,
      })),
  };
}

export function firstRelation<T>(relation: SalesRelation<T>) {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation;
}

export function normalizeStatus(value: string | null | undefined): SalesOrderStatus {
  if (
    value === 'pending' ||
    value === 'confirmed' ||
    value === 'preparing' ||
    value === 'delivered' ||
    value === 'closed' ||
    value === 'cancelled'
  ) {
    return value;
  }

  return DEFAULT_STATUS;
}

export function toNumber(value: number | string | null | undefined) {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function mapSalesOrderItemRowToDetail(row: SalesOrderItemQueryRow): SalesOrderItemDetail {
  return {
    id: row.id,
    productId: row.product_id,
    skuSnapshot: row.sku_snapshot,
    productNameSnapshot: row.product_name_snapshot,
    variantSnapshot: row.variant_snapshot,
    unitPriceSnapshot: toNumber(row.unit_price_snapshot) ?? 0,
    quantity: toNumber(row.quantity) ?? 0,
    subtotal: toNumber(row.subtotal) ?? 0,
  };
}

function sortItemsByStoredOrder(
  items: SalesOrderItemDetail[],
  metadata: Record<string, unknown> | null,
) {
  const storedOrder = Array.isArray(metadata?.item_order_skus)
    ? metadata.item_order_skus.filter((sku): sku is string => typeof sku === 'string')
    : [];

  if (storedOrder.length === 0) {
    return items;
  }

  const rankBySku = new Map(storedOrder.map((sku, index) => [sku, index]));

  return [...items].sort(
    (left, right) =>
      (rankBySku.get(left.skuSnapshot) ?? Number.MAX_SAFE_INTEGER) -
      (rankBySku.get(right.skuSnapshot) ?? Number.MAX_SAFE_INTEGER),
  );
}
