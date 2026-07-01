'use server';

import { revalidatePath } from 'next/cache';
import { writeAuditLog } from '@/lib/audit';
import { supabaseServer } from '@/lib/supabaseServer';
import { getTenantIdentity } from '@/modules/tenant/queries';
import { calculateAdjustedPrice, toNumber } from './mapper';
import {
  validateApplyBrandPricing,
  validateApplyCostPlus,
  validateCopyRetailToWholesale,
  validatePricingBlock,
  validateRecalculateBrandPrices,
  validateRecalculatePriceList,
  validateSingleProductPrice,
  validateUpdatePriceListRule,
  validateUpdateProductPrices,
} from './validators';
import type {
  ApplyBrandPricingInput,
  ApplyCostPlusInput,
  CopyRetailToWholesaleInput,
  NormalizedPricingBlock,
  PricingBrandOperation,
  PricingCommandResult,
  PricingFieldErrors,
  PricingListCode,
  PricingMode,
  PricingPriceList,
  RecalculateBrandPricesInput,
  RecalculatePriceListInput,
  UpdatePriceListRuleInput,
  UpdatePricingBlockInput,
  UpdateProductPricesInput,
  UpdateSingleProductPriceInput,
} from './types';

type TenantContext = { id: string; slug: string; currency: string };
type ProductRecord = {
  id: string;
  sku: string;
  brand_id: string;
  cost: number | string | null;
  cost_currency: string | null;
};
type PriceRecord = {
  product_id: string;
  price_list_id: string;
  price: number | string | null;
  pricing_mode: string | null;
  margin_percent_override: number | string | null;
  calculated_from_cost: boolean | null;
};
type PriceWrite = {
  tenant_id: string;
  product_id: string;
  price_list_id: string;
  price: number;
  currency: string;
  pricing_mode: PricingMode;
  margin_percent_override: number | null;
  calculated_from_cost: boolean;
};

export async function updateProductPrices(input: UpdateProductPricesInput) {
  const validation = validateUpdateProductPrices(input);
  if (!validation.value) return commandError('Hay datos que necesitan revision.', validation.fieldErrors);
  return writePricingBlock(validation.value, 'product_price.updated');
}

export async function updatePricingBlock(input: UpdatePricingBlockInput) {
  const validation = validatePricingBlock(input);
  if (!validation.value) return commandError('Hay datos que necesitan revision.', validation.fieldErrors);
  return writePricingBlock(validation.value, 'product_price.block_updated');
}

export async function updateSingleProductPrice(input: UpdateSingleProductPriceInput) {
  const validation = validateSingleProductPrice(input);
  if (!validation.value) return commandError('El precio necesita revision.', validation.fieldErrors);
  const normalized = validation.value;
  const context = await loadContext(normalized.tenantSlug, [normalized.productId]);
  if (!context.ok) return commandError(context.error);
  const list = context.lists[normalized.priceListCode];
  if (!list?.isActive) return commandError('La lista de precios no existe o esta inactiva.');

  const existing = await getPrices(context.tenant.id, [normalized.productId], [list.id]);
  if (existing.error) return commandError(existing.error);
  const write = toManualPriceWrite(context.tenant, normalized.productId, list.id, normalized.price);
  const writeResult = await upsertPrices([write]);
  if (writeResult.error) return commandError(writeResult.error);

  const audit = await writeAuditLog({
    tenantId: context.tenant.id,
    entityType: 'product_price',
    entityId: normalized.productId,
    action: 'product_price.updated',
    before: existing.prices.map(toAuditExistingPrice),
    after: toAuditPrice(write),
    metadata: { priceListCode: normalized.priceListCode, pricingMode: 'manual' },
  });
  revalidatePricingPaths();
  return commandSuccess('Precio manual actualizado.', 1, audit.error);
}

export async function updatePriceListRule(input: UpdatePriceListRuleInput) {
  const validation = validateUpdatePriceListRule(input);
  if (!validation.value) return commandError('La regla necesita revision.', validation.fieldErrors);
  const tenantResult = await getTenant(validation.value.tenantSlug);
  if (!tenantResult.tenant) return commandError(tenantResult.error);
  const listsResult = await getPricingLists(tenantResult.tenant.id);
  if (listsResult.error) return commandError(listsResult.error);
  const list = listsResult.byCode[validation.value.priceListCode];
  if (!list) return commandError('La lista de precios no existe.');

  const { error } = await supabaseServer
    .from('price_lists')
    .update({ pricing_mode: validation.value.pricingMode, margin_percent: validation.value.marginPercent })
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('id', list.id);
  if (error) return commandError(error.message);

  const audit = await writeAuditLog({
    tenantId: tenantResult.tenant.id,
    entityType: 'price_list',
    entityId: list.id,
    action: 'price_list.pricing_rule_updated',
    before: { pricingMode: list.pricingMode, marginPercent: list.marginPercent },
    after: { pricingMode: validation.value.pricingMode, marginPercent: validation.value.marginPercent },
    metadata: { priceListCode: list.code },
  });
  revalidatePricingPaths();
  return commandSuccess(`Regla de ${list.name} actualizada.`, 1, audit.error);
}

export async function recalculatePriceList(input: RecalculatePriceListInput) {
  const validation = validateRecalculatePriceList(input);
  if (!validation.value) return commandError('El recalculo necesita revision.', validation.fieldErrors);
  return recalculateScope(validation.value.tenantSlug, validation.value.priceListCode, null);
}

export async function recalculateBrandPrices(input: RecalculateBrandPricesInput) {
  const validation = validateRecalculateBrandPrices(input);
  if (!validation.value) return commandError('El recalculo por marca necesita revision.', validation.fieldErrors);
  return recalculateScope(
    validation.value.tenantSlug,
    validation.value.priceListCode,
    validation.value.brandId,
  );
}

export async function applyCostPlusToProducts(input: ApplyCostPlusInput) {
  const validation = validateApplyCostPlus(input);
  if (!validation.value) return commandError('La accion necesita revision.', validation.fieldErrors);
  const context = await loadContext(validation.value.tenantSlug, validation.value.productIds);
  if (!context.ok) return commandError(context.error);
  const list = context.lists[validation.value.priceListCode];
  if (!list?.isActive) return commandError('La lista de precios no existe o esta inactiva.');

  const missing = context.products.filter((product) => (toNumber(product.cost) ?? 0) <= 0);
  if (missing.length) return missingCostError(missing);
  const existing = await getPrices(context.tenant.id, validation.value.productIds, [list.id]);
  if (existing.error) return commandError(existing.error);
  const existingMap = new Map(existing.prices.map((price) => [price.product_id, price]));
  const writes = context.products.map((product) => {
    const previous = existingMap.get(product.id);
    const override = toNumber(previous?.margin_percent_override);
    return toCalculatedPriceWrite(context.tenant, product, list, override);
  });
  const writeResult = await upsertPrices(writes);
  if (writeResult.error) return commandError(writeResult.error);

  const audit = await writeAuditLog({
    tenantId: context.tenant.id,
    entityType: 'product_price',
    action: 'product_price.cost_plus_applied',
    before: existing.prices.map(toAuditExistingPrice),
    after: writes.map(toAuditPrice),
    metadata: { priceListCode: list.code, productCount: writes.length },
  });
  revalidatePricingPaths();
  return commandSuccess(`Costo + margen aplicado a ${writes.length} productos.`, writes.length, audit.error);
}

export async function copyRetailToWholesale(input: CopyRetailToWholesaleInput) {
  const validation = validateCopyRetailToWholesale(input);
  if (!validation.value) return commandError('La copia masiva necesita revision.', validation.fieldErrors);
  const normalized = validation.value;
  const context = await loadContext(normalized.tenantSlug, normalized.productIds);
  if (!context.ok) return commandError(context.error);
  const retail = context.lists.minorista;
  const wholesale = context.lists.mayorista;
  if (!retail?.isActive || !wholesale?.isActive) {
    return commandError('Las listas Minorista y Mayorista deben estar activas.');
  }
  const prices = await getPrices(context.tenant.id, normalized.productIds, [retail.id, wholesale.id]);
  if (prices.error) return commandError(prices.error);
  const priceMap = buildPriceMap(prices.prices);
  const missing = context.products.filter((product) => !priceMap.has(priceKey(product.id, retail.id)));
  if (missing.length) return commandError(`No se realizo la copia: ${missing.length} productos no tienen precio Minorista.`);
  const writes = context.products.map((product) =>
    toManualPriceWrite(
      context.tenant,
      product.id,
      wholesale.id,
      calculateAdjustedPrice(priceMap.get(priceKey(product.id, retail.id)) as number, normalized.adjustmentPercent),
    ),
  );
  const writeResult = await upsertPrices(writes);
  if (writeResult.error) return commandError(writeResult.error);
  const audit = await writeAuditLog({
    tenantId: context.tenant.id,
    entityType: 'product_price',
    action: 'product_price.bulk_copied',
    before: snapshotPrices(prices.prices, wholesale.id),
    after: writes.map(toAuditPrice),
    metadata: { sourceList: retail.code, targetList: wholesale.code, adjustmentPercent: normalized.adjustmentPercent, productCount: writes.length, pricingMode: 'manual' },
  });
  revalidatePricingPaths();
  return commandSuccess(`Se copiaron ${writes.length} precios a Mayorista.`, writes.length, audit.error);
}

export async function applyBrandPricing(input: ApplyBrandPricingInput) {
  const validation = validateApplyBrandPricing(input);
  if (!validation.value) return commandError('La accion por marca necesita revision.', validation.fieldErrors);
  const tenantResult = await getTenant(validation.value.tenantSlug);
  if (!tenantResult.tenant) return commandError(tenantResult.error);
  const brandResult = await getBrand(tenantResult.tenant.id, validation.value.brandId);
  if (!brandResult.brand) return commandError(brandResult.error);
  const productsResult = await getProducts(tenantResult.tenant.id, undefined, validation.value.brandId);
  if (productsResult.error) return commandError(productsResult.error);
  if (!productsResult.products.length) return commandError('La marca seleccionada no tiene productos.');
  const listsResult = await getPricingLists(tenantResult.tenant.id);
  if (listsResult.error) return commandError(listsResult.error);
  const listIds = Object.values(listsResult.byCode).filter(isActiveList).map((list) => list.id);
  const pricesResult = await getPrices(tenantResult.tenant.id, productsResult.products.map((p) => p.id), listIds);
  if (pricesResult.error) return commandError(pricesResult.error);
  const writesResult = buildBrandWrites(
    tenantResult.tenant,
    productsResult.products,
    pricesResult.prices,
    listsResult.byCode,
    validation.value.operation,
    validation.value.percentage,
  );
  if (writesResult.error) return commandError(writesResult.error);
  const writeResult = await upsertPrices(writesResult.writes);
  if (writeResult.error) return commandError(writeResult.error);
  const audit = await writeAuditLog({
    tenantId: tenantResult.tenant.id,
    entityType: 'product_price',
    action: 'product_price.brand_adjusted',
    before: pricesResult.prices.map(toAuditExistingPrice),
    after: writesResult.writes.map(toAuditPrice),
    metadata: { brandId: brandResult.brand.id, brandName: brandResult.brand.name, operation: validation.value.operation, percentage: validation.value.percentage, priceCount: writesResult.writes.length, pricingMode: 'manual' },
  });
  revalidatePricingPaths();
  return commandSuccess(`Se actualizaron ${writesResult.writes.length} precios de ${brandResult.brand.name}.`, writesResult.writes.length, audit.error);
}

async function writePricingBlock(
  input: NormalizedPricingBlock,
  auditAction: 'product_price.updated' | 'product_price.block_updated',
) {
  const context = await loadContext(input.tenantSlug, input.rows.map((row) => row.productId));
  if (!context.ok) return commandError(context.error);
  const fieldErrors = validateRowsForLists(input, context.lists);
  if (Object.keys(fieldErrors).length) return commandError('Los datos no permiten calcular todos los precios.', fieldErrors);
  const activeLists = Object.values(context.lists).filter(isActiveList);
  const existing = await getPrices(context.tenant.id, input.rows.map((row) => row.productId), activeLists.map((list) => list.id));
  if (existing.error) return commandError(existing.error);

  const productById = new Map(context.products.map((product) => [product.id, product]));
  const writes = input.rows.flatMap((row) => activeLists.map((list) => {
    const mode = list.code === 'minorista' ? row.minoristaPricingMode : row.mayoristaPricingMode;
    const price = list.code === 'minorista' ? row.minoristaPrice : row.mayoristaPrice;
    const override = list.code === 'minorista' ? row.minoristaMarginOverride : row.mayoristaMarginOverride;
    if (mode === 'manual') return toManualPriceWrite(context.tenant, row.productId, list.id, price as number);
    const product = productById.get(row.productId) as ProductRecord;
    return toCalculatedPriceWrite(
      context.tenant,
      { ...product, cost: row.cost, cost_currency: row.costCurrency },
      list,
      override,
    );
  }));

  const costUpdates = await Promise.all(input.rows.map(async (row) => {
    const { error } = await supabaseServer
      .from('products')
      .update({ cost: row.cost, cost_currency: row.costCurrency })
      .eq('tenant_id', context.tenant.id)
      .eq('id', row.productId);
    return error?.message ?? null;
  }));
  const costError = costUpdates.find(Boolean);
  if (costError) return commandError(costError);
  const writeResult = await upsertPrices(writes);
  if (writeResult.error) return commandError(writeResult.error);

  const previousProducts = new Map(context.products.map((product) => [product.id, product]));
  const changedCosts = input.rows.filter((row) => {
    const previous = previousProducts.get(row.productId);
    return (toNumber(previous?.cost) ?? 0) !== row.cost || (previous?.cost_currency ?? context.tenant.currency) !== row.costCurrency;
  });
  const costAudits = await Promise.all(changedCosts.map((row) => {
    const previous = previousProducts.get(row.productId);
    return writeAuditLog({
      tenantId: context.tenant.id,
      entityType: 'product',
      entityId: row.productId,
      action: 'product.cost_updated',
      before: { cost: toNumber(previous?.cost) ?? 0, costCurrency: previous?.cost_currency },
      after: { cost: row.cost, costCurrency: row.costCurrency },
    });
  }));
  const priceAudit = await writeAuditLog({
    tenantId: context.tenant.id,
    entityType: 'product_price',
    entityId: input.rows.length === 1 ? input.rows[0].productId : null,
    action: auditAction,
    before: existing.prices.map(toAuditExistingPrice),
    after: writes.map(toAuditPrice),
    metadata: { productCount: input.rows.length, priceCount: writes.length },
  });
  revalidatePricingPaths();
  return commandSuccess(
    input.rows.length === 1 ? 'Costo y precios actualizados.' : `Se guardaron ${input.rows.length} productos.`,
    input.rows.length,
    priceAudit.error ?? costAudits.find((audit) => audit.error)?.error ?? null,
  );
}

async function recalculateScope(tenantSlug: string, priceListCode: PricingListCode, brandId: string | null) {
  const tenantResult = await getTenant(tenantSlug);
  if (!tenantResult.tenant) return commandError(tenantResult.error);
  if (brandId) {
    const brandResult = await getBrand(tenantResult.tenant.id, brandId);
    if (!brandResult.brand) return commandError(brandResult.error);
  }
  const listsResult = await getPricingLists(tenantResult.tenant.id);
  if (listsResult.error) return commandError(listsResult.error);
  const list = listsResult.byCode[priceListCode];
  if (!list?.isActive) return commandError('La lista no existe o esta inactiva.');
  const productsResult = await getProducts(tenantResult.tenant.id, undefined, brandId ?? undefined);
  if (productsResult.error) return commandError(productsResult.error);
  const pricesResult = await getPrices(tenantResult.tenant.id, productsResult.products.map((product) => product.id), [list.id]);
  if (pricesResult.error) return commandError(pricesResult.error);
  const calculatedPrices = pricesResult.prices.filter((price) => price.pricing_mode === 'cost_plus_percent');
  if (!calculatedPrices.length) {
    return commandError(`No hay precios ${list.name} en modo Costo + margen para recalcular.`);
  }
  const calculatedIds = new Set(calculatedPrices.map((price) => price.product_id));
  const products = productsResult.products.filter((product) => calculatedIds.has(product.id));
  const missing = products.filter((product) => (toNumber(product.cost) ?? 0) <= 0);
  if (missing.length) return missingCostError(missing);
  const priceByProduct = new Map(calculatedPrices.map((price) => [price.product_id, price]));
  const writes = products.map((product) =>
    toCalculatedPriceWrite(
      tenantResult.tenant as TenantContext,
      product,
      list,
      toNumber(priceByProduct.get(product.id)?.margin_percent_override),
    ),
  );
  const writeResult = await upsertPrices(writes);
  if (writeResult.error) return commandError(writeResult.error);
  const audit = await writeAuditLog({
    tenantId: tenantResult.tenant.id,
    entityType: 'product_price',
    action: 'product_price.bulk_recalculated',
    before: calculatedPrices.map(toAuditExistingPrice),
    after: writes.map(toAuditPrice),
    metadata: { priceListCode, brandId, productCount: writes.length },
  });
  revalidatePricingPaths();
  return commandSuccess(`Se recalcularon ${writes.length} precios ${list.name}.`, writes.length, audit.error);
}

function validateRowsForLists(input: NormalizedPricingBlock, lists: Partial<Record<PricingListCode, PricingPriceList>>) {
  const errors: PricingFieldErrors = {};
  input.rows.forEach((row) => {
    (['minorista', 'mayorista'] as const).forEach((code) => {
      const list = lists[code];
      if (!list?.isActive) return;
      const mode = code === 'minorista' ? row.minoristaPricingMode : row.mayoristaPricingMode;
      const price = code === 'minorista' ? row.minoristaPrice : row.mayoristaPrice;
      if (mode === 'manual' && price === null) errors[`${row.productId}.${code}Price`] = `El precio ${list.name} es obligatorio en modo manual.`;
      if (mode === 'cost_plus_percent' && row.cost <= 0) errors[`${row.productId}.cost`] = 'Carga un costo mayor a cero antes de calcular precios.';
    });
  });
  return errors;
}

function buildBrandWrites(
  tenant: TenantContext,
  products: ProductRecord[],
  prices: PriceRecord[],
  lists: Partial<Record<PricingListCode, PricingPriceList>>,
  operation: PricingBrandOperation,
  percentage: number,
): { writes: PriceWrite[]; error: string | null } {
  if (operation === 'copy_retail_to_wholesale') {
    const retail = lists.minorista;
    const wholesale = lists.mayorista;
    if (!retail?.isActive || !wholesale?.isActive) return { writes: [], error: 'Las listas Minorista y Mayorista deben estar activas.' };
    const priceMap = buildPriceMap(prices);
    const missing = products.filter((product) => !priceMap.has(priceKey(product.id, retail.id)));
    if (missing.length) return { writes: [], error: `${missing.length} productos no tienen precio Minorista.` };
    return {
      writes: products.map((product) => toManualPriceWrite(tenant, product.id, wholesale.id, calculateAdjustedPrice(priceMap.get(priceKey(product.id, retail.id)) as number, percentage))),
      error: null,
    };
  }
  const signed = operation === 'decrease' ? -percentage : percentage;
  return {
    writes: prices.map((price) => toManualPriceWrite(tenant, price.product_id, price.price_list_id, calculateAdjustedPrice(toNumber(price.price) ?? 0, signed))),
    error: prices.length ? null : 'La marca no tiene precios para ajustar.',
  };
}

async function loadContext(tenantSlug: string, productIds: string[]) {
  const tenantResult = await getTenant(tenantSlug);
  if (!tenantResult.tenant) return { ok: false as const, error: tenantResult.error };
  const [listsResult, productsResult] = await Promise.all([
    getPricingLists(tenantResult.tenant.id),
    getProducts(tenantResult.tenant.id, productIds),
  ]);
  const error = listsResult.error ?? productsResult.error;
  if (error) return { ok: false as const, error };
  return { ok: true as const, tenant: tenantResult.tenant, lists: listsResult.byCode, products: productsResult.products };
}

async function getTenant(tenantSlug: string): Promise<{ tenant: TenantContext | null; error: string | null }> {
  const result = await getTenantIdentity(tenantSlug);
  return {
    tenant: result.tenant ? { id: result.tenant.id, slug: result.tenant.slug, currency: result.tenant.currency } : null,
    error: result.error,
  };
}

async function getPricingLists(tenantId: string) {
  const { data, error } = await supabaseServer
    .from('price_lists')
    .select('id, code, name, is_active, is_default, pricing_mode, margin_percent')
    .eq('tenant_id', tenantId)
    .in('code', ['minorista', 'mayorista']);
  const lists = (data ?? []).filter((list) => list.code === 'minorista' || list.code === 'mayorista').map((list) => ({
    id: list.id,
    code: list.code as PricingListCode,
    name: list.name,
    isActive: list.is_active,
    isDefault: list.is_default,
    pricingMode: list.pricing_mode === 'cost_plus_percent' ? 'cost_plus_percent' as const : 'manual' as const,
    marginPercent: toNumber(list.margin_percent) ?? 0,
  }));
  return { byCode: Object.fromEntries(lists.map((list) => [list.code, list])) as Partial<Record<PricingListCode, PricingPriceList>>, error: error?.message ?? null };
}

async function getProducts(tenantId: string, productIds?: string[], brandId?: string) {
  let query = supabaseServer.from('products').select('id, sku, brand_id, cost, cost_currency').eq('tenant_id', tenantId);
  if (productIds) query = query.in('id', productIds);
  if (brandId) query = query.eq('brand_id', brandId);
  const { data, error } = await query;
  const products = (data ?? []) as ProductRecord[];
  return {
    products,
    error: error?.message ?? (productIds && products.length !== productIds.length ? 'Uno o mas productos no pertenecen al tenant.' : null),
  };
}

async function getPrices(tenantId: string, productIds: string[], priceListIds: string[]) {
  if (!productIds.length || !priceListIds.length) return { prices: [] as PriceRecord[], error: null as string | null };
  const { data, error } = await supabaseServer
    .from('product_prices')
    .select('product_id, price_list_id, price, pricing_mode, margin_percent_override, calculated_from_cost')
    .eq('tenant_id', tenantId)
    .in('product_id', productIds)
    .in('price_list_id', priceListIds);
  return { prices: (data ?? []) as PriceRecord[], error: error?.message ?? null };
}

async function getBrand(tenantId: string, brandId: string) {
  const { data, error } = await supabaseServer.from('brands').select('id, name').eq('tenant_id', tenantId).eq('id', brandId).eq('is_active', true).maybeSingle();
  return { brand: data, error: error?.message ?? (!data ? 'La marca no existe o esta inactiva.' : null) };
}

async function upsertPrices(writes: PriceWrite[]) {
  const { error } = await supabaseServer.from('product_prices').upsert(writes, { onConflict: 'product_id,price_list_id' });
  return { error: error?.message ?? null };
}

function toManualPriceWrite(tenant: TenantContext, productId: string, priceListId: string, price: number): PriceWrite {
  return { tenant_id: tenant.id, product_id: productId, price_list_id: priceListId, price: roundMoney(price), currency: tenant.currency, pricing_mode: 'manual', margin_percent_override: null, calculated_from_cost: false };
}

function toCalculatedPriceWrite(tenant: TenantContext, product: ProductRecord, list: PricingPriceList, override: number | null): PriceWrite {
  const cost = toNumber(product.cost) ?? 0;
  const margin = override ?? list.marginPercent;
  return { tenant_id: tenant.id, product_id: product.id, price_list_id: list.id, price: calculateAdjustedPrice(cost, margin), currency: product.cost_currency || tenant.currency, pricing_mode: 'cost_plus_percent', margin_percent_override: override, calculated_from_cost: true };
}

function buildPriceMap(prices: PriceRecord[]) {
  return new Map(prices.map((price) => [priceKey(price.product_id, price.price_list_id), toNumber(price.price)] as const).filter((entry): entry is readonly [string, number] => entry[1] !== null));
}

function priceKey(productId: string, priceListId: string) { return `${productId}:${priceListId}`; }
function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function snapshotPrices(prices: PriceRecord[], priceListId: string) { return prices.filter((price) => price.price_list_id === priceListId).map(toAuditExistingPrice); }
function isActiveList(list: PricingPriceList | undefined): list is PricingPriceList { return Boolean(list?.isActive); }

function toAuditExistingPrice(price: PriceRecord) {
  return { productId: price.product_id, priceListId: price.price_list_id, price: toNumber(price.price), pricingMode: price.pricing_mode, marginPercentOverride: toNumber(price.margin_percent_override), calculatedFromCost: price.calculated_from_cost };
}
function toAuditPrice(price: PriceWrite) {
  return { productId: price.product_id, priceListId: price.price_list_id, price: price.price, currency: price.currency, pricingMode: price.pricing_mode, marginPercentOverride: price.margin_percent_override, calculatedFromCost: price.calculated_from_cost };
}

function missingCostError(products: ProductRecord[]) {
  return commandError(`No se recalculo: ${products.length} productos no tienen costo mayor a cero.`, { cost: `Revisa: ${products.slice(0, 5).map((product) => product.sku).join(', ')}.` });
}

function commandSuccess(message: string, affected: number, auditError: string | null): PricingCommandResult {
  return { ok: true, affected, message, error: null, warning: auditError ? `Los cambios se guardaron, pero fallo la auditoria: ${auditError}` : null, fieldErrors: {} };
}
function commandError(error: string | null, fieldErrors: PricingFieldErrors = {}): PricingCommandResult {
  return { ok: false, affected: 0, message: null, error: error ?? 'No se pudo completar la operacion de precios.', warning: null, fieldErrors };
}
function revalidatePricingPaths() {
  for (const path of ['/admin/precios', '/admin/productos', '/admin', '/catalogo', '/admin/sales/new']) {
    try { revalidatePath(path); } catch { /* Server actions provide the static generation store. */ }
  }
}
