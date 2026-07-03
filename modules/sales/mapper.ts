import type {
  SalesOrderDetail,
  SalesOrderAuditRow,
  SalesOrderTimelineEntry,
  SalesOrderItemDetail,
  SalesOrderItemQueryRow,
  SalesOrderListItem,
  SalesOrderQueryRow,
  SalesProductOption,
  SalesProductQueryRow,
  SalesRelation,
  SalesOrderSource,
  SalesOrderStatus,
} from './types';

const DEFAULT_STATUS: SalesOrderStatus = 'draft';
const DEFAULT_CURRENCY = 'ARS';

export function mapSalesOrderRowToListItem(row: SalesOrderQueryRow): SalesOrderListItem {
  const account = firstRelation(row.customer_accounts);
  const priceList = firstRelation(row.price_lists);
  const identity = resolveIdentitySnapshot(row);
  const commercial = resolveCommercialSnapshot(row);
  const items = sortQueryItemsByStoredOrder(row.sales_order_items ?? [], row.metadata_json);
  const firstItem = items[0] ?? null;

  return {
    id: row.id,
    accountId: row.account_id,
    accountName: account?.name ?? snapshotText(identity, 'name') ?? 'Sin identificar',
    status: normalizeStatus(row.status),
    priceListId: row.price_list_id,
    priceListName: priceList?.name ?? snapshotText(commercial, 'priceListName') ?? 'Sin lista',
    subtotal: toNumber(row.subtotal) ?? 0,
    discount: toNumber(row.discount) ?? 0,
    total: toNumber(row.total) ?? 0,
    itemsCount: items.length,
    firstProductName: firstItem?.product_name_snapshot ?? null,
    firstProductVariant: firstItem?.variant_snapshot ?? null,
    source: normalizeSource(row.source),
    currency: normalizeCurrency(row.currency),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesOrderRowToDetail(
  row: SalesOrderQueryRow,
  tenantName: string,
  currency: string,
  auditRows: SalesOrderAuditRow[] = [],
): SalesOrderDetail {
  const listItem = mapSalesOrderRowToListItem(row);
  const account = firstRelation(row.customer_accounts);
  const identity = resolveIdentitySnapshot(row);
  const items = (row.sales_order_items ?? []).map(mapSalesOrderItemRowToDetail);

  return {
    ...listItem,
    tenantName,
    currency: normalizeCurrency(row.currency || currency),
    hasPublicIdentity: Boolean(identity && snapshotText(identity, 'name')),
    accountWhatsapp: account?.whatsapp_phone ?? snapshotText(identity, 'whatsapp'),
    customerCompany: account?.legal_name ?? snapshotText(identity, 'company'),
    customerEmail: account?.email ?? snapshotText(identity, 'email'),
    customerTaxId: account?.tax_id ?? snapshotText(identity, 'cuit'),
    notes: row.notes ?? null,
    items: sortItemsByStoredOrder(items, row.metadata_json),
    timeline: buildSalesOrderTimeline(
      listItem.status,
      row.created_at,
      row.updated_at,
      auditRows,
    ),
  };
}

function buildSalesOrderTimeline(
  currentStatus: SalesOrderStatus,
  createdAt: string,
  updatedAt: string,
  auditRows: SalesOrderAuditRow[],
): SalesOrderTimelineEntry[] {
  const recordedAt = new Map<SalesOrderStatus, string>();
  for (const audit of auditRows) {
    const status = audit.after_json?.status;
    if (typeof status === 'string' && isSalesOrderStatus(status) && !recordedAt.has(status)) {
      recordedAt.set(status, audit.created_at);
    }
  }

  const flow: Array<{ key: SalesOrderStatus; label: string }> = [
    { key: 'pending', label: 'Pendiente' },
    { key: 'confirmed', label: 'Confirmado' },
    { key: 'preparing', label: 'Preparando' },
    { key: 'delivered', label: 'Entregado' },
    currentStatus === 'cancelled'
      ? { key: 'cancelled', label: 'Cancelado' }
      : { key: 'closed', label: 'Cerrado' },
  ];
  const progression: SalesOrderStatus[] = ['draft', 'pending', 'confirmed', 'preparing', 'delivered', 'closed'];
  const currentRank = progression.indexOf(currentStatus);

  return [
    {
      key: 'created' as const,
      label: 'Creado',
      occurredAt: createdAt,
      state: 'complete' as const,
      inferred: false,
    },
    ...flow.map(({ key, label }) => {
      const occurredAt = recordedAt.get(key) ?? (key === currentStatus ? updatedAt : null);
      if (currentStatus === 'cancelled' && key === 'cancelled') {
        return { key, label, occurredAt, state: 'cancelled' as const, inferred: !recordedAt.has(key) };
      }
      if (currentStatus === 'cancelled') {
        const reached = recordedAt.has(key);
        return {
          key,
          label,
          occurredAt: recordedAt.get(key) ?? null,
          state: reached ? 'complete' as const : 'pending' as const,
          inferred: false,
        };
      }
      const rank = progression.indexOf(key);
      const state: SalesOrderTimelineEntry['state'] =
        rank < currentRank ? 'complete' : rank === currentRank ? 'current' : 'pending';
      return { key, label, occurredAt, state, inferred: state !== 'pending' && !recordedAt.has(key) };
    }),
  ];
}

function isSalesOrderStatus(value: string): value is SalesOrderStatus {
  return value === 'draft' || value === 'pending' || value === 'confirmed' ||
    value === 'preparing' || value === 'delivered' || value === 'closed' || value === 'cancelled';
}

function resolveIdentitySnapshot(row: SalesOrderQueryRow) {
  return snapshotObject(row.identity_snapshot_json)
    ?? snapshotObject(row.metadata_json?.identity_snapshot);
}

function resolveCommercialSnapshot(row: SalesOrderQueryRow) {
  return snapshotObject(row.commercial_snapshot_json)
    ?? snapshotObject(row.metadata_json?.commercial_snapshot);
}

function snapshotText(snapshot: Record<string, unknown> | null | undefined, field: string) {
  const value = snapshot?.[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

function snapshotObject(value: unknown) {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null;
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

export function normalizeSource(value: string | null | undefined): SalesOrderSource {
  return value === 'public_commerce' ? 'public_commerce' : 'admin';
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

function sortQueryItemsByStoredOrder(
  items: SalesOrderItemQueryRow[],
  metadata: Record<string, unknown> | null,
) {
  const storedOrder = Array.isArray(metadata?.item_order_skus)
    ? metadata.item_order_skus.filter((sku): sku is string => typeof sku === 'string')
    : [];

  if (storedOrder.length === 0) return items;
  const rankBySku = new Map(storedOrder.map((sku, index) => [sku, index]));
  return [...items].sort(
    (left, right) =>
      (rankBySku.get(left.sku_snapshot) ?? Number.MAX_SAFE_INTEGER) -
      (rankBySku.get(right.sku_snapshot) ?? Number.MAX_SAFE_INTEGER),
  );
}

function normalizeCurrency(value: string | null | undefined) {
  const currency = value?.trim().toUpperCase() ?? '';
  return /^[A-Z]{3}$/.test(currency) ? currency : DEFAULT_CURRENCY;
}
