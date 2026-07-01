import type {
  PricingPriceList,
  PricingProduct,
  PricingProductQueryRow,
  PricingRelation,
  PricingMode,
} from './types';

export function mapPricingProduct(
  row: PricingProductQueryRow,
  priceLists: PricingPriceList[],
): PricingProduct {
  const brand = firstRelation(row.brands);
  const category = firstRelation(row.categories);
  const minoristaList = priceLists.find((list) => list.code === 'minorista');
  const mayoristaList = priceLists.find((list) => list.code === 'mayorista');
  const minorista = findPrice(row, minoristaList?.id);
  const mayorista = findPrice(row, mayoristaList?.id);

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    variant: row.variant,
    brandId: brand?.id ?? '',
    brandName: brand?.name ?? 'Sin marca',
    categoryId: category?.id ?? '',
    categoryName: category?.name ?? 'Sin categoria',
    isActive: row.is_active,
    cost: toNumber(row.cost) ?? 0,
    costCurrency: row.cost_currency ?? 'ARS',
    minoristaPrice: toNumber(minorista?.price),
    mayoristaPrice: toNumber(mayorista?.price),
    minoristaPricingMode: normalizePricingMode(minorista?.pricing_mode ?? minoristaList?.pricingMode),
    mayoristaPricingMode: normalizePricingMode(mayorista?.pricing_mode ?? mayoristaList?.pricingMode),
    minoristaMarginOverride: toNumber(minorista?.margin_percent_override),
    mayoristaMarginOverride: toNumber(mayorista?.margin_percent_override),
    minoristaCalculatedFromCost: minorista?.calculated_from_cost === true,
    mayoristaCalculatedFromCost: mayorista?.calculated_from_cost === true,
  };
}

export function toNumber(value: number | string | null | undefined) {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateAdjustedPrice(price: number, percentage: number) {
  return roundMoney(Math.max(0, price * (1 + percentage / 100)));
}

function findPrice(row: PricingProductQueryRow, priceListId: string | undefined) {
  if (!priceListId) {
    return null;
  }

  return row.product_prices?.find((item) => item.price_list_id === priceListId) ?? null;
}

export function normalizePricingMode(value: string | null | undefined): PricingMode {
  return value === 'cost_plus_percent' ? 'cost_plus_percent' : 'manual';
}

function firstRelation<T>(relation: PricingRelation<T>) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
