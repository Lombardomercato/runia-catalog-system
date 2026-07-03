import { supabaseServer } from '@/lib/supabaseServer';
import { writeAuditLog } from '@/lib/audit';
import { BuildSalesOrderWhatsAppMessage } from '@/core/orders/use-cases/BuildSalesOrderWhatsAppMessage';
import { buildSalesOrderWhatsAppUrl } from '@/core/orders/whatsapp';
import type {
  DraftOrderIdentity,
  PersistSalesOrderFromDraftInput,
  PersistSalesOrderFromDraftResult,
  SalesOrderCommercialSnapshot,
  SalesOrderFromDraft,
  SalesOrderItemSnapshot,
} from '@/core/orders/interfaces';

type PublicSalesOrderRow = {
  id: string;
  tenant_id: string;
  source_draft_id: string;
  idempotency_key: string;
  status: string;
  currency: string;
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  notes: string | null;
  identity_snapshot_json: unknown;
  commercial_snapshot_json: unknown;
  created_at: string;
  updated_at: string;
  sales_order_items: Array<{
    product_id: string | null;
    sku_snapshot: string;
    product_name_snapshot: string;
    variant_snapshot: string | null;
    unit_price_snapshot: number | string;
    quantity: number | string;
    subtotal: number | string;
    currency_snapshot: string;
    product_snapshot_json: unknown;
  }> | null;
};

export type PublicSalesOrderWhatsAppReceipt = {
  orderId: string;
  message: string;
  whatsappUrl: string | null;
  destinationConfigured: boolean;
};

export async function findPersistedPublicSalesOrder(input: {
  tenantId: string;
  sourceDraftId: string;
  idempotencyKey: string;
}): Promise<SalesOrderFromDraft | null> {
  const { data, error } = await supabaseServer
    .from('sales_orders')
    .select(PUBLIC_ORDER_SELECT)
    .eq('tenant_id', input.tenantId)
    .eq('source_draft_id', input.sourceDraftId)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapPublicSalesOrder(data as PublicSalesOrderRow) : null;
}

export async function persistPublicSalesOrder(
  input: PersistSalesOrderFromDraftInput,
): Promise<PersistSalesOrderFromDraftResult> {
  const { data, error } = await supabaseServer.rpc('create_public_sales_order', {
    p_payload: input,
  });
  if (error) throw new Error(error.message);

  const rpcResult = data as { created?: unknown } | null;
  const order = await findPersistedPublicSalesOrder({
    tenantId: input.tenantId,
    sourceDraftId: input.sourceDraftId,
    idempotencyKey: input.idempotencyKey,
  });
  if (!order) throw new Error('La transaccion no devolvio el pedido persistido.');
  return { order, created: rpcResult?.created === true };
}

export async function buildPublicSalesOrderWhatsApp(input: {
  tenantId: string;
  sourceDraftId: string;
  idempotencyKey: string;
  locale: string;
}): Promise<PublicSalesOrderWhatsAppReceipt> {
  const order = await findPersistedPublicSalesOrder(input);
  if (!order) throw new Error('PUBLIC_SALES_ORDER_NOT_FOUND');

  const { data: tenant, error: tenantError } = await supabaseServer
    .from('tenants')
    .select('whatsapp_phone')
    .eq('id', input.tenantId)
    .eq('status', 'active')
    .single();
  if (tenantError || !tenant) throw new Error('PUBLIC_TENANT_NOT_FOUND');

  const built = new BuildSalesOrderWhatsAppMessage().execute({
    order,
    locale: input.locale,
  });
  if (!built.ok) throw new Error(`WHATSAPP_MESSAGE_INVALID:${built.error.code}`);

  const destination = typeof tenant.whatsapp_phone === 'string'
    ? tenant.whatsapp_phone
    : '';
  const whatsappUrl = buildSalesOrderWhatsAppUrl(destination, built.value.message);
  const audit = await writeAuditLog({
    tenantId: order.tenantId,
    actorType: 'anonymous',
    actorName: order.identity.name,
    entityType: 'sales_order',
    entityId: order.id,
    action: 'sales_order_whatsapp_message_built',
    after: {
      orderId: order.id,
      shortOrderId: built.value.shortOrderId,
      message: built.value.message,
    },
    metadata: {
      draft_id: order.sourceDraftId,
      channel: 'whatsapp',
      destination_configured: whatsappUrl !== null,
    },
  });
  if (audit.error) throw new Error('WHATSAPP_AUDIT_FAILED');

  return {
    orderId: order.id,
    message: built.value.message,
    whatsappUrl,
    destinationConfigured: whatsappUrl !== null,
  };
}

const PUBLIC_ORDER_SELECT = `
  id,
  tenant_id,
  source_draft_id,
  idempotency_key,
  status,
  currency,
  subtotal,
  discount,
  total,
  notes,
  identity_snapshot_json,
  commercial_snapshot_json,
  created_at,
  updated_at,
  sales_order_items(
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

function mapPublicSalesOrder(row: PublicSalesOrderRow): SalesOrderFromDraft {
  const identity = asIdentity(row.identity_snapshot_json);
  const commercial = asCommercial(row.commercial_snapshot_json);
  const items = (row.sales_order_items ?? []).map(mapItem);
  if (!identity || !commercial || items.length === 0 || row.status !== 'pending') {
    throw new Error('El snapshot persistido del pedido es invalido.');
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sourceDraftId: row.source_draft_id,
    idempotencyKey: row.idempotency_key,
    status: 'pending',
    identity,
    commercial,
    items,
    subtotal: money(row.subtotal, row.currency),
    discount: money(row.discount, row.currency),
    total: money(row.total, row.currency),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItem(row: NonNullable<PublicSalesOrderRow['sales_order_items']>[number]) {
  const snapshot = isRecord(row.product_snapshot_json) ? row.product_snapshot_json : {};
  const currency = row.currency_snapshot;
  const item: SalesOrderItemSnapshot = {
    productId: row.product_id ?? stringValue(snapshot.productId),
    sku: row.sku_snapshot,
    name: row.product_name_snapshot,
    variant: row.variant_snapshot,
    line: nullableString(snapshot.line),
    brandName: nullableString(snapshot.brandName),
    categoryName: nullableString(snapshot.categoryName),
    unitPrice: money(row.unit_price_snapshot, currency),
    quantity: Number(row.quantity),
    subtotal: money(row.subtotal, currency),
  };
  if (!item.productId || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
    throw new Error('Un item persistido es invalido.');
  }
  return item;
}

function asIdentity(value: unknown): DraftOrderIdentity | null {
  if (!isRecord(value) || !stringValue(value.name) || !stringValue(value.whatsapp)) return null;
  return {
    name: stringValue(value.name),
    company: nullableString(value.company),
    whatsapp: stringValue(value.whatsapp),
    email: nullableString(value.email),
    cuit: nullableString(value.cuit),
    notes: nullableString(value.notes),
  };
}

function asCommercial(value: unknown): SalesOrderCommercialSnapshot | null {
  if (!isRecord(value)) return null;
  const tenantName = stringValue(value.tenantName);
  const priceListId = stringValue(value.priceListId);
  const priceListCode = stringValue(value.priceListCode);
  const priceListName = stringValue(value.priceListName);
  const currency = stringValue(value.currency);
  if (!tenantName || !priceListId || !priceListCode || !priceListName || !currency) return null;
  return {
    tenantName,
    priceListId,
    priceListCode,
    priceListName,
    currency,
    channel: 'public_commerce',
  };
}

function money(value: number | string, currency: string) {
  return { amount: String(value), currency };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value ? value : null;
}
