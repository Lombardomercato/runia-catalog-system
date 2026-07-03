'use server';

import { revalidatePath } from 'next/cache';
import { writeAuditLog } from '@/lib/audit';
import { supabaseServer } from '@/lib/supabaseServer';
import {
  createAccountFromSalesOrderSnapshot,
  rollbackAccountCreatedFromSalesOrder,
} from '@/modules/accounts/commands';
import { getTenantIdentity } from '@/modules/tenant/queries';
import {
  validateCreateSalesOrderInput,
  validateCreateAccountFromSalesOrderInput,
  validateDuplicateSalesOrderInput,
  validateUpdateSalesOrderStatusInput,
  validateLinkSalesOrderAccountInput,
  validateUpdateSalesOrderInput,
  isSalesOrderStatusTransitionAllowed,
} from './validators';
import type {
  CreateSalesOrderInput,
  CreateAccountFromSalesOrderInput,
  DuplicateSalesOrderInput,
  NormalizedSalesOrderInput,
  NormalizedSalesOrderItemInput,
  SalesCommandFieldErrors,
  SalesCommandResult,
  SalesOrderItemQueryRow,
  SalesProductQueryRow,
  UpdateSalesOrderInput,
  UpdateSalesOrderStatusInput,
  SalesOrderStatus,
  LinkSalesOrderAccountInput,
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
  account_id: string | null;
  status: string;
  price_list_id: string;
  subtotal: number | string | null;
  discount: number | string | null;
  total: number | string | null;
  notes: string | null;
  metadata_json: Record<string, unknown> | null;
  source: string;
  currency: string;
  identity_snapshot_json: Record<string, unknown> | null;
  commercial_snapshot_json: Record<string, unknown> | null;
  sales_order_items: SalesOrderItemQueryRow[] | null;
};

type SalesOrderAccountContextRecord = {
  id: string;
  account_id: string | null;
  price_list_id: string;
  notes: string | null;
  identity_snapshot_json: Record<string, unknown> | null;
  metadata_json: Record<string, unknown> | null;
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

  const snapshot = validateDuplicableOrder(source.order, sourceItems);
  if (!snapshot.ok) return commandError(snapshot.error);

  const { data, error } = await supabaseServer
    .from('sales_orders')
    .insert({
      tenant_id: tenantResult.tenant.id,
      account_id: source.order.account_id,
      status: 'draft',
      price_list_id: source.order.price_list_id,
      subtotal: snapshot.subtotal,
      discount: snapshot.discount,
      total: snapshot.total,
      notes: source.order.notes,
      source: 'admin',
      currency: snapshot.currency,
      identity_snapshot_json: snapshot.identity,
      commercial_snapshot_json: snapshot.commercial,
      metadata_json: {
        ...(source.order.metadata_json ?? {}),
        duplicated_from_order_id: source.order.id,
        duplicated_from_source: source.order.source,
        item_order_skus: sourceItems.map((item) => item.sku_snapshot),
      },
    })
    .select('id, updated_at')
    .single();

  if (error || !data) {
    return commandError(error?.message ?? 'No se pudo duplicar el pedido.');
  }

  const itemsWrite = await writeDuplicatedSalesOrderItems(
    tenantResult.tenant.id,
    data.id,
    sourceItems,
    snapshot.currency,
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
    after: {
      accountId: source.order.account_id,
      status: 'draft',
      priceListId: source.order.price_list_id,
      source: 'admin',
      duplicatedFromSource: source.order.source,
      subtotal: snapshot.subtotal,
      discount: snapshot.discount,
      total: snapshot.total,
      currency: snapshot.currency,
      identity: snapshot.identity,
      items: sourceItems.map(toItemAuditSnapshot),
    },
    metadata: {
      sourceOrderId: source.order.id,
    },
  });

  revalidateSalesPaths(data.id);

  return commandSuccess('Pedido duplicado como Draft.', 1, data.updated_at, data.id);
}

export async function updateSalesOrderStatus(
  input: UpdateSalesOrderStatusInput,
): Promise<SalesCommandResult> {
  const validation = validateUpdateSalesOrderStatusInput(input);
  if (!validation.value) {
    return commandError('No se pudo validar el cambio de estado.', validation.fieldErrors);
  }
  const tenantResult = await getTenant(validation.value.tenantSlug);
  if (!tenantResult.tenant) return commandError(tenantResult.error);

  const { data: existing, error: existingError } = await supabaseServer
    .from('sales_orders')
    .select('id, status, updated_at')
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('id', validation.value.orderId)
    .single();
  if (existingError || !existing) return commandError('No se encontro el pedido solicitado.');

  const currentStatus = existing.status as SalesOrderStatus;
  if (!isSalesOrderStatusTransitionAllowed(currentStatus, validation.value.status)) {
    return commandError(statusTransitionError(currentStatus, validation.value.status));
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from('sales_orders')
    .update({ status: validation.value.status })
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('id', validation.value.orderId)
    .eq('status', currentStatus)
    .select('updated_at')
    .maybeSingle();
  if (updateError) return commandError(updateError.message);
  if (!updated) return commandError('El pedido cambio mientras se procesaba la accion. Actualiza la vista.');

  const audit = await writeAuditLog({
    tenantId: tenantResult.tenant.id,
    entityType: 'sales_order',
    entityId: validation.value.orderId,
    action: 'sales_order.status_updated',
    before: { status: currentStatus, updatedAt: existing.updated_at },
    after: { status: validation.value.status, updatedAt: updated.updated_at },
    metadata: { transition: `${currentStatus}->${validation.value.status}` },
  });
  if (audit.error) return commandError(`El estado se actualizo, pero fallo la auditoria: ${audit.error}`);

  revalidateSalesPaths(validation.value.orderId);
  return commandSuccess('Estado del pedido actualizado.', 1, updated.updated_at, validation.value.orderId);
}

export async function linkSalesOrderAccount(
  input: LinkSalesOrderAccountInput,
): Promise<SalesCommandResult> {
  const validation = validateLinkSalesOrderAccountInput(input);
  if (!validation.value) {
    return commandError('No se pudo validar la vinculacion.', validation.fieldErrors);
  }
  const tenantResult = await getTenant(validation.value.tenantSlug);
  if (!tenantResult.tenant) return commandError(tenantResult.error);
  const context = await getSalesOrderAccountContext(
    tenantResult.tenant.id,
    validation.value.orderId,
  );
  if (!context.order) return commandError(context.error);
  if (context.order.account_id) return commandError('El pedido ya tiene una Account vinculada.');
  if (!resolvePublicIdentity(context.order)) {
    return commandError('El pedido no contiene una identidad publica valida.');
  }
  const account = await getSalesAccount(tenantResult.tenant.id, validation.value.accountId);
  if (!account.record) return commandError(account.error, { accountId: account.error ?? undefined });

  const linked = await attachSalesOrderAccount({
    tenantId: tenantResult.tenant.id,
    order: context.order,
    accountId: account.record.id,
    mode: 'existing',
  });
  if (!linked.linked || linked.error) return commandError(linked.error);
  revalidateSalesPaths(context.order.id);
  return {
    ...commandSuccess('Account vinculada al pedido.', 1, linked.updatedAt, context.order.id),
    accountId: account.record.id,
  };
}

export async function createAccountFromSalesOrder(
  input: CreateAccountFromSalesOrderInput,
): Promise<SalesCommandResult> {
  const validation = validateCreateAccountFromSalesOrderInput(input);
  if (!validation.value) {
    return commandError('No se pudo validar la Account.', validation.fieldErrors);
  }
  const tenantResult = await getTenant(validation.value.tenantSlug);
  if (!tenantResult.tenant) return commandError(tenantResult.error);
  const context = await getSalesOrderAccountContext(
    tenantResult.tenant.id,
    validation.value.orderId,
  );
  if (!context.order) return commandError(context.error);
  if (context.order.account_id) return commandError('El pedido ya tiene una Account vinculada.');
  if (!resolvePublicIdentity(context.order)) {
    return commandError('El pedido no contiene una identidad publica valida.');
  }

  const created = await createAccountFromSalesOrderSnapshot({
    tenantSlug: validation.value.tenantSlug,
    sourceOrderId: context.order.id,
    name: validation.value.name,
    legalName: validation.value.legalName,
    taxId: validation.value.taxId,
    whatsapp: validation.value.whatsapp,
    email: validation.value.email,
    address: null,
    priceListId: context.order.price_list_id,
    discountPercent: 0,
    isActive: true,
    notes: validation.value.notes,
  });
  if (!created.ok || !created.accountId) {
    return commandError(created.error, created.fieldErrors as SalesCommandFieldErrors);
  }

  const linked = await attachSalesOrderAccount({
    tenantId: tenantResult.tenant.id,
    order: context.order,
    accountId: created.accountId,
    mode: 'created',
  });
  if (!linked.linked) {
    await rollbackAccountCreatedFromSalesOrder({
      tenantSlug: validation.value.tenantSlug,
      accountId: created.accountId,
      sourceOrderId: context.order.id,
    });
    return commandError(linked.error ?? 'No se pudo vincular la Account creada.');
  }
  if (linked.error) return commandError(linked.error);

  const accountAudit = await writeAuditLog({
    tenantId: tenantResult.tenant.id,
    entityType: 'customer_account',
    entityId: created.accountId,
    action: 'account.created_from_sales_order',
    after: {
      accountId: created.accountId,
      name: validation.value.name,
      legalName: validation.value.legalName,
      whatsapp: validation.value.whatsapp,
      email: validation.value.email,
      taxId: validation.value.taxId,
      notes: validation.value.notes,
      priceListId: context.order.price_list_id,
    },
    metadata: { sourceOrderId: context.order.id },
  });
  if (accountAudit.error) {
    return commandError(`La Account se vinculo, pero fallo la auditoria: ${accountAudit.error}`);
  }
  revalidateSalesPaths(context.order.id);
  return {
    ...commandSuccess('Account creada y vinculada.', 1, linked.updatedAt, context.order.id),
    accountId: created.accountId,
  };
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

async function writeDuplicatedSalesOrderItems(
  tenantId: string,
  orderId: string,
  items: SalesOrderItemQueryRow[],
  currency: string,
): Promise<SalesCommandResult> {
  const { error } = await supabaseServer.from('sales_order_items').insert(
    items.map((item) => ({
      tenant_id: tenantId,
      order_id: orderId,
      product_id: item.product_id,
      sku_snapshot: item.sku_snapshot,
      product_name_snapshot: item.product_name_snapshot,
      variant_snapshot: item.variant_snapshot,
      unit_price_snapshot: toNumber(item.unit_price_snapshot),
      quantity: toNumber(item.quantity),
      subtotal: toNumber(item.subtotal),
      currency_snapshot: normalizeCurrency(item.currency_snapshot) ?? currency,
      product_snapshot_json: item.product_snapshot_json ?? {},
    })),
  );

  if (error) return commandError(error.message);
  return commandSuccess('Items duplicados.', items.length, undefined, orderId);
}

function validateDuplicableOrder(
  order: ExistingSalesOrderRecord,
  items: SalesOrderItemQueryRow[],
):
  | {
      ok: true;
      subtotal: number;
      discount: number;
      total: number;
      currency: string;
      identity: Record<string, unknown>;
      commercial: Record<string, unknown>;
    }
  | { ok: false; error: string } {
  if (items.length === 0) return { ok: false, error: 'El pedido no tiene items para duplicar.' };

  const currency = normalizeCurrency(order.currency);
  const subtotal = toNumber(order.subtotal);
  const discount = toNumber(order.discount);
  const total = toNumber(order.total);
  if (!currency || subtotal === null || discount === null || total === null) {
    return { ok: false, error: 'El pedido fuente no tiene moneda o totales validos.' };
  }
  if (subtotal < 0 || discount < 0 || total < 0 || !sameMoney(total, subtotal - discount)) {
    return { ok: false, error: 'Los totales del pedido fuente son inconsistentes.' };
  }

  let itemsSubtotal = 0;
  for (const item of items) {
    const quantity = toNumber(item.quantity);
    const unitPrice = toNumber(item.unit_price_snapshot);
    const itemSubtotal = toNumber(item.subtotal);
    const itemCurrency: string = normalizeCurrency(item.currency_snapshot) ?? currency;
    if (
      !item.sku_snapshot?.trim() ||
      !item.product_name_snapshot?.trim() ||
      quantity === null ||
      quantity <= 0 ||
      unitPrice === null ||
      unitPrice < 0 ||
      itemSubtotal === null ||
      itemSubtotal < 0 ||
      itemCurrency !== currency ||
      !sameMoney(itemSubtotal, unitPrice * quantity)
    ) {
      return { ok: false, error: 'El pedido fuente contiene un item snapshot invalido.' };
    }
    itemsSubtotal += itemSubtotal;
  }
  if (!sameMoney(itemsSubtotal, subtotal)) {
    return { ok: false, error: 'Los items no coinciden con el subtotal del pedido fuente.' };
  }

  const identity = snapshotObject(order.identity_snapshot_json)
    ?? snapshotObject(order.metadata_json?.identity_snapshot)
    ?? {};
  if (!order.account_id && (!snapshotText(identity, 'name') || !snapshotText(identity, 'whatsapp'))) {
    return { ok: false, error: 'El pedido sin Account no tiene una identidad publica valida.' };
  }
  const commercial = snapshotObject(order.commercial_snapshot_json)
    ?? snapshotObject(order.metadata_json?.commercial_snapshot)
    ?? {};

  return { ok: true, subtotal, discount, total, currency, identity, commercial };
}

function toItemAuditSnapshot(item: SalesOrderItemQueryRow) {
  return {
    productId: item.product_id,
    sku: item.sku_snapshot,
    name: item.product_name_snapshot,
    variant: item.variant_snapshot,
    unitPrice: toNumber(item.unit_price_snapshot),
    quantity: toNumber(item.quantity),
    subtotal: toNumber(item.subtotal),
    currency: item.currency_snapshot,
  };
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
        source,
        currency,
        identity_snapshot_json,
        commercial_snapshot_json,
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

async function getSalesOrderAccountContext(
  tenantId: string,
  orderId: string,
): Promise<{ order: SalesOrderAccountContextRecord | null; error: string | null }> {
  const { data, error } = await supabaseServer
    .from('sales_orders')
    .select('id, account_id, price_list_id, notes, identity_snapshot_json, metadata_json')
    .eq('tenant_id', tenantId)
    .eq('id', orderId)
    .single();
  if (error || !data) return { order: null, error: 'No se encontro el pedido solicitado.' };
  return { order: data as SalesOrderAccountContextRecord, error: null };
}

function resolvePublicIdentity(order: SalesOrderAccountContextRecord) {
  const identity = snapshotObject(order.identity_snapshot_json)
    ?? snapshotObject(order.metadata_json?.identity_snapshot);
  return identity && snapshotText(identity, 'name') ? identity : null;
}

async function attachSalesOrderAccount(input: {
  tenantId: string;
  order: SalesOrderAccountContextRecord;
  accountId: string;
  mode: 'created' | 'existing';
}) {
  const { data, error } = await supabaseServer
    .from('sales_orders')
    .update({ account_id: input.accountId })
    .eq('tenant_id', input.tenantId)
    .eq('id', input.order.id)
    .is('account_id', null)
    .select('updated_at')
    .maybeSingle();
  if (error) return { linked: false, updatedAt: undefined, error: error.message };
  if (!data) {
    return {
      linked: false,
      updatedAt: undefined,
      error: 'El pedido fue vinculado por otro operador. Actualiza la vista.',
    };
  }
  const audit = await writeAuditLog({
    tenantId: input.tenantId,
    entityType: 'sales_order',
    entityId: input.order.id,
    action: 'sales_order.account_linked',
    before: {
      accountId: null,
      identitySnapshot: resolvePublicIdentity(input.order),
    },
    after: { accountId: input.accountId },
    metadata: { mode: input.mode },
  });
  return {
    linked: true,
    updatedAt: data.updated_at,
    error: audit.error
      ? `La Account se vinculo, pero fallo la auditoria: ${audit.error}`
      : null,
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

function snapshotObject(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function snapshotText(snapshot: Record<string, unknown>, field: string) {
  const value = snapshot[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeCurrency(value: string | null | undefined) {
  const currency = value?.trim().toUpperCase() ?? '';
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function sameMoney(left: number, right: number) {
  return Math.abs(left - right) < 0.005;
}

function statusTransitionError(current: SalesOrderStatus, target: SalesOrderStatus) {
  if (current === 'closed') return 'Un pedido cerrado no puede cambiar de estado ni cancelarse.';
  if (current === 'cancelled') return 'Un pedido cancelado no puede cambiar de estado.';
  if (target === 'delivered') return 'El pedido solo puede marcarse entregado desde En preparacion.';
  if (target === 'closed') return 'El pedido solo puede cerrarse desde Entregado.';
  if (current === 'pending' && target === 'draft') return 'No se permite volver un pedido pendiente a borrador.';
  return `La transicion ${current} -> ${target} no esta permitida.`;
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
