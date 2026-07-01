'use server';

import { revalidatePath } from 'next/cache';
import { writeAuditLog } from '@/lib/audit';
import { supabaseServer } from '@/lib/supabaseServer';
import { getTenantIdentity } from '@/modules/tenant/queries';
import {
  validateCreateSalesOrderInput,
  validateDuplicateSalesOrderInput,
  validateUpdateSalesOrderInput,
} from './validators';
import type {
  CreateSalesOrderInput,
  DuplicateSalesOrderInput,
  NormalizedSalesOrderInput,
  NormalizedSalesOrderItemInput,
  SalesCommandFieldErrors,
  SalesCommandResult,
  SalesOrderItemQueryRow,
  SalesProductQueryRow,
  UpdateSalesOrderInput,
} from './types';

type TenantRecord = {
  id: string;
  slug: string;
};

type SalesAccountRecord = {
  id: string;
  name: string;
  price_list_id: string | null;
  discount_percent: number | string | null;
};

type PriceListRecord = {
  id: string;
  name: string;
};

type ExistingSalesOrderRecord = {
  id: string;
  account_id: string;
  status: string;
  price_list_id: string;
  subtotal: number | string | null;
  discount: number | string | null;
  total: number | string | null;
  notes: string | null;
  metadata_json: Record<string, unknown> | null;
  sales_order_items: SalesOrderItemQueryRow[] | null;
};

type ResolvedSalesOrderItem = {
  productId: string;
  skuSnapshot: string;
  productNameSnapshot: string;
  variantSnapshot: string | null;
  unitPriceSnapshot: number;
  quantity: number;
  subtotal: number;
};

type ResolvedSalesOrder = {
  account: SalesAccountRecord;
  priceList: PriceListRecord;
  subtotal: number;
  discount: number;
  total: number;
  items: ResolvedSalesOrderItem[];
};

export async function createSalesOrder(input: CreateSalesOrderInput): Promise<SalesCommandResult> {
  const validation = validateCreateSalesOrderInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }

  const tenantResult = await getTenant(validation.value.tenantSlug);

  if (!tenantResult.tenant) {
    return commandError(tenantResult.error);
  }

  const resolved = await resolveSalesOrder(tenantResult.tenant.id, validation.value);

  if (!resolved.order) {
    return commandError(resolved.error, resolved.fieldErrors);
  }

  const { data, error } = await supabaseServer
    .from('sales_orders')
    .insert({
      tenant_id: tenantResult.tenant.id,
      account_id: resolved.order.account.id,
      status: validation.value.status,
      price_list_id: resolved.order.priceList.id,
      subtotal: resolved.order.subtotal,
      discount: resolved.order.discount,
      total: resolved.order.total,
      notes: validation.value.notes,
      metadata_json: buildOrderMetadata(null, resolved.order),
    })
    .select('id, updated_at')
    .single();

  if (error || !data) {
    return commandError(error?.message ?? 'No se pudo crear el pedido.');
  }

  const itemsWrite = await writeSalesOrderItems(tenantResult.tenant.id, data.id, resolved.order.items);

  if (!itemsWrite.ok) {
    return itemsWrite;
  }

  await writeAuditLog({
    tenantId: tenantResult.tenant.id,
    entityType: 'sales_order',
    entityId: data.id,
    action: 'sales_order.created',
    before: null,
    after: buildAuditSnapshot(validation.value, resolved.order),
  });

  revalidateSalesPaths(data.id);

  return commandSuccess('Pedido creado.', 1, data.updated_at, data.id);
}

export async function updateSalesOrder(input: UpdateSalesOrderInput): Promise<SalesCommandResult> {
  const validation = validateUpdateSalesOrderInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }
  const orderId = validation.value.orderId as string;

  const tenantResult = await getTenant(validation.value.tenantSlug);

  if (!tenantResult.tenant) {
    return commandError(tenantResult.error);
  }

  const existing = await getExistingSalesOrder(tenantResult.tenant.id, orderId);

  if (!existing.order) {
    return commandError(existing.error, {
      orderId: existing.error ?? 'No se encontro el pedido solicitado.',
    });
  }

  const resolved = await resolveSalesOrder(
    tenantResult.tenant.id,
    validation.value,
    existing.order.sales_order_items ?? [],
  );

  if (!resolved.order) {
    return commandError(resolved.error, resolved.fieldErrors);
  }

  const { data, error } = await supabaseServer
    .from('sales_orders')
    .update({
      account_id: resolved.order.account.id,
      status: validation.value.status,
      price_list_id: resolved.order.priceList.id,
      subtotal: resolved.order.subtotal,
      discount: resolved.order.discount,
      total: resolved.order.total,
      notes: validation.value.notes,
      metadata_json: buildOrderMetadata(existing.order.metadata_json, resolved.order),
    })
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('id', orderId)
    .select('updated_at')
    .single();

  if (error) {
    return commandError(error.message);
  }

  const { error: deleteError } = await supabaseServer
    .from('sales_order_items')
    .delete()
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('order_id', orderId);

  if (deleteError) {
    return commandError(deleteError.message);
  }

  const itemsWrite = await writeSalesOrderItems(
    tenantResult.tenant.id,
    orderId,
    resolved.order.items,
  );

  if (!itemsWrite.ok) {
    return itemsWrite;
  }

  await writeAuditLog({
    tenantId: tenantResult.tenant.id,
    entityType: 'sales_order',
    entityId: orderId,
    action: 'sales_order.updated',
    before: existing.order,
    after: buildAuditSnapshot(validation.value, resolved.order),
  });

  revalidateSalesPaths(orderId);

  return commandSuccess('Pedido actualizado.', 1, data?.updated_at, orderId);
}

export async function duplicateSalesOrder(
  input: DuplicateSalesOrderInput,
): Promise<SalesCommandResult> {
  const duplicateValidation = validateDuplicateSalesOrderInput(input);

  if (!duplicateValidation.value) {
    return commandError('No se pudo identificar el pedido a duplicar.', duplicateValidation.fieldErrors);
  }

  const tenantResult = await getTenant(duplicateValidation.value.tenantSlug);

  if (!tenantResult.tenant) {
    return commandError(tenantResult.error);
  }

  const source = await getExistingSalesOrder(
    tenantResult.tenant.id,
    duplicateValidation.value.orderId,
  );

  if (!source.order) {
    return commandError(source.error, {
      orderId: source.error ?? 'No se encontro el pedido a duplicar.',
    });
  }

  const sourceItems = sortItemsByStoredOrder(
    source.order.sales_order_items ?? [],
    source.order.metadata_json,
  );

  if (sourceItems.length === 0 || sourceItems.some((item) => !item.product_id)) {
    return commandError(
      sourceItems.length === 0
        ? 'El pedido no tiene items para duplicar.'
        : 'El pedido contiene productos eliminados y no puede duplicarse de forma segura.',
    );
  }

  const draftValidation = validateCreateSalesOrderInput({
    tenantSlug: duplicateValidation.value.tenantSlug,
    accountId: source.order.account_id,
    status: 'draft',
    notes: source.order.notes,
    items: sourceItems.map((item) => ({
      itemId: null,
      productId: item.product_id ?? '',
      quantity: toNumber(item.quantity),
    })),
  });

  if (!draftValidation.value) {
    return commandError('El pedido fuente contiene datos que necesitan revision.', draftValidation.fieldErrors);
  }

  const resolved = await resolveSalesOrder(
    tenantResult.tenant.id,
    draftValidation.value,
    [],
    source.order.price_list_id,
  );

  if (!resolved.order) {
    return commandError(resolved.error, resolved.fieldErrors);
  }

  const { data, error } = await supabaseServer
    .from('sales_orders')
    .insert({
      tenant_id: tenantResult.tenant.id,
      account_id: resolved.order.account.id,
      status: 'draft',
      price_list_id: resolved.order.priceList.id,
      subtotal: resolved.order.subtotal,
      discount: resolved.order.discount,
      total: resolved.order.total,
      notes: draftValidation.value.notes,
      metadata_json: buildOrderMetadata(null, resolved.order, {
        duplicated_from_order_id: source.order.id,
      }),
    })
    .select('id, updated_at')
    .single();

  if (error || !data) {
    return commandError(error?.message ?? 'No se pudo duplicar el pedido.');
  }

  const itemsWrite = await writeSalesOrderItems(
    tenantResult.tenant.id,
    data.id,
    resolved.order.items,
  );

  if (!itemsWrite.ok) {
    await deleteSalesOrder(tenantResult.tenant.id, data.id);
    return itemsWrite;
  }

  await writeAuditLog({
    tenantId: tenantResult.tenant.id,
    entityType: 'sales_order',
    entityId: data.id,
    action: 'sales_order.duplicated',
    before: null,
    after: buildAuditSnapshot(draftValidation.value, resolved.order),
    metadata: {
      sourceOrderId: source.order.id,
    },
  });

  revalidateSalesPaths(data.id);

  return commandSuccess('Pedido duplicado como Draft.', 1, data.updated_at, data.id);
}

async function resolveSalesOrder(
  tenantId: string,
  input: NormalizedSalesOrderInput,
  existingItems: SalesOrderItemQueryRow[] = [],
  priceListOverrideId?: string,
): Promise<{
  order: ResolvedSalesOrder | null;
  error: string | null;
  fieldErrors: SalesCommandFieldErrors;
}> {
  const fieldErrors: SalesCommandFieldErrors = {};
  const account = await getSalesAccount(tenantId, input.accountId);

  if (!account.record) {
    return {
      order: null,
      error: account.error,
      fieldErrors: {
        accountId: account.error ?? 'La account seleccionada no existe o no esta activa.',
      },
    };
  }

  const priceList = priceListOverrideId
    ? await getPriceListById(tenantId, priceListOverrideId)
    : input.priceListId
      ? await getPriceListById(tenantId, input.priceListId)
    : account.record.price_list_id
      ? await getPriceListById(tenantId, account.record.price_list_id)
      : await getDefaultPriceList(tenantId);

  if (!priceList.record) {
    const priceListField = priceListOverrideId || input.priceListId ? 'priceListId' : 'accountId';

    return {
      order: null,
      error: priceList.error,
      fieldErrors: {
        [priceListField]: 'La lista de precios seleccionada no existe o no esta activa.',
      },
    };
  }

  const existingById = new Map(existingItems.map((item) => [item.id, item]));
  const products = await getProductsForItems(
    tenantId,
    input.items.filter((item) => !canUseExistingSnapshot(item, existingById)).map((item) => item.productId),
  );

  if (products.error) {
    return {
      order: null,
      error: products.error,
      fieldErrors,
    };
  }

  const productById = new Map(products.products.map((product) => [product.id, product]));
  const resolvedItems = input.items.map((item, index) => {
    const existing = item.itemId ? existingById.get(item.itemId) : null;

    if (existing && existing.product_id === item.productId) {
      const unitPrice = toNumber(existing.unit_price_snapshot);

      if (unitPrice === null) {
        fieldErrors[`item.${index}.price`] = 'El item existente no tiene precio snapshot.';
        return null;
      }

      return {
        productId: item.productId,
        skuSnapshot: existing.sku_snapshot,
        productNameSnapshot: existing.product_name_snapshot,
        variantSnapshot: existing.variant_snapshot,
        unitPriceSnapshot: unitPrice,
        quantity: item.quantity,
        subtotal: roundMoney(unitPrice * item.quantity),
      };
    }

    const product = productById.get(item.productId);

    if (!product) {
      fieldErrors[`item.${index}.productId`] = 'El producto no existe o no esta activo.';
      return null;
    }

    const productPrice = product.product_prices?.find(
      (price) => price.price_list_id === priceList.record?.id,
    );
    const unitPrice = toNumber(productPrice?.price);

    if (unitPrice === null) {
      fieldErrors[`item.${index}.price`] = 'El producto no tiene precio para la lista seleccionada.';
      return null;
    }

    return {
      productId: product.id,
      skuSnapshot: product.sku,
      productNameSnapshot: product.name,
      variantSnapshot: product.variant,
      unitPriceSnapshot: unitPrice,
      quantity: item.quantity,
      subtotal: roundMoney(unitPrice * item.quantity),
    };
  });

  if (Object.keys(fieldErrors).length > 0) {
    return {
      order: null,
      error: 'Hay items que necesitan revision.',
      fieldErrors,
    };
  }

  const items = resolvedItems.filter((item): item is ResolvedSalesOrderItem => Boolean(item));
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.subtotal, 0));
  const discountPercent = toNumber(account.record.discount_percent) ?? 0;
  const discount = roundMoney(subtotal * (discountPercent / 100));
  const total = roundMoney(Math.max(0, subtotal - discount));

  return {
    order: {
      account: account.record,
      priceList: priceList.record,
      subtotal,
      discount,
      total,
      items,
    },
    error: null,
    fieldErrors,
  };
}

function canUseExistingSnapshot(
  item: NormalizedSalesOrderItemInput,
  existingById: Map<string, SalesOrderItemQueryRow>,
) {
  if (!item.itemId) {
    return false;
  }

  const existing = existingById.get(item.itemId);

  return Boolean(existing && existing.product_id === item.productId);
}

async function writeSalesOrderItems(
  tenantId: string,
  orderId: string,
  items: ResolvedSalesOrderItem[],
): Promise<SalesCommandResult> {
  const { error } = await supabaseServer.from('sales_order_items').insert(
    items.map((item) => ({
      tenant_id: tenantId,
      order_id: orderId,
      product_id: item.productId,
      sku_snapshot: item.skuSnapshot,
      product_name_snapshot: item.productNameSnapshot,
      variant_snapshot: item.variantSnapshot,
      unit_price_snapshot: item.unitPriceSnapshot,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
  );

  if (error) {
    return commandError(error.message);
  }

  return commandSuccess('Items guardados.', items.length, undefined, orderId);
}

async function getTenant(tenantSlug: string): Promise<{
  tenant: TenantRecord | null;
  error: string | null;
}> {
  const result = await getTenantIdentity(tenantSlug);

  if (result.error || !result.tenant) {
    return {
      tenant: null,
      error: result.error,
    };
  }

  return {
    tenant: result.tenant,
    error: null,
  };
}

async function getSalesAccount(tenantId: string, accountId: string): Promise<{
  record: SalesAccountRecord | null;
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('customer_accounts')
    .select('id, name, price_list_id, discount_percent')
    .eq('tenant_id', tenantId)
    .eq('id', accountId)
    .eq('status', 'active')
    .single();

  if (error || !data) {
    return {
      record: null,
      error: 'La account seleccionada no existe o no esta activa.',
    };
  }

  return {
    record: data,
    error: null,
  };
}

async function getPriceListById(tenantId: string, priceListId: string): Promise<{
  record: PriceListRecord | null;
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('price_lists')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('id', priceListId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return {
      record: null,
      error: 'No se encontro la lista de precios de la account.',
    };
  }

  return {
    record: data,
    error: null,
  };
}

async function getDefaultPriceList(tenantId: string): Promise<{
  record: PriceListRecord | null;
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('price_lists')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      record: null,
      error: 'No hay listas de precio activas para el tenant.',
    };
  }

  return {
    record: data,
    error: null,
  };
}

async function getExistingSalesOrder(
  tenantId: string,
  orderId: string,
): Promise<{
  order: ExistingSalesOrderRecord | null;
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('sales_orders')
    .select(
      `
        id,
        account_id,
        status,
        price_list_id,
        subtotal,
        discount,
        total,
        notes,
        metadata_json,
        sales_order_items(
          id,
          product_id,
          sku_snapshot,
          product_name_snapshot,
          variant_snapshot,
          unit_price_snapshot,
          quantity,
          subtotal
        )
      `,
    )
    .eq('tenant_id', tenantId)
    .eq('id', orderId)
    .single();

  if (error || !data) {
    return {
      order: null,
      error: 'No se encontro el pedido solicitado.',
    };
  }

  return {
    order: data as ExistingSalesOrderRecord,
    error: null,
  };
}

async function getProductsForItems(tenantId: string, productIds: string[]): Promise<{
  products: SalesProductQueryRow[];
  error: string | null;
}> {
  const uniqueProductIds = [...new Set(productIds)];

  if (uniqueProductIds.length === 0) {
    return {
      products: [],
      error: null,
    };
  }

  const { data, error } = await supabaseServer
    .from('products')
    .select(
      `
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
      `,
    )
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('id', uniqueProductIds);

  if (error) {
    return {
      products: [],
      error: error.message,
    };
  }

  return {
    products: (data ?? []) as SalesProductQueryRow[],
    error: null,
  };
}

async function deleteSalesOrder(tenantId: string, orderId: string) {
  await supabaseServer
    .from('sales_orders')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', orderId);
}

function buildAuditSnapshot(input: NormalizedSalesOrderInput, resolved: ResolvedSalesOrder) {
  return {
    accountId: resolved.account.id,
    accountName: resolved.account.name,
    status: input.status,
    priceListId: resolved.priceList.id,
    priceListName: resolved.priceList.name,
    subtotal: resolved.subtotal,
    discount: resolved.discount,
    total: resolved.total,
    notes: input.notes,
    items: resolved.items,
  };
}

function buildOrderMetadata(
  existing: Record<string, unknown> | null,
  resolved: ResolvedSalesOrder,
  additions: Record<string, unknown> = {},
) {
  return {
    ...(existing ?? {}),
    ...additions,
    item_order_skus: resolved.items.map((item) => item.skuSnapshot),
  };
}

function sortItemsByStoredOrder(
  items: SalesOrderItemQueryRow[],
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
      (rankBySku.get(left.sku_snapshot) ?? Number.MAX_SAFE_INTEGER) -
      (rankBySku.get(right.sku_snapshot) ?? Number.MAX_SAFE_INTEGER),
  );
}

function commandSuccess(
  message: string,
  affected: number,
  updatedAt?: string,
  orderId?: string,
): SalesCommandResult {
  return {
    ok: true,
    affected,
    message,
    error: null,
    fieldErrors: {},
    orderId,
    updatedAt,
  };
}

function commandError(
  error: string | null,
  fieldErrors: SalesCommandFieldErrors = {},
): SalesCommandResult {
  return {
    ok: false,
    affected: 0,
    message: null,
    error: error ?? 'No se pudo completar la operacion.',
    fieldErrors,
  };
}

function revalidateSalesPaths(orderId?: string) {
  const paths = ['/admin/sales', '/admin'];

  if (orderId) {
    paths.push(`/admin/sales/${orderId}`);
  }

  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      // Server actions provide the static generation store; scripts/tests do not.
    }
  }
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
