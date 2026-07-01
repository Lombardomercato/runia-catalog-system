import type {
  ProductDetail,
  ProductEditablePrice,
  ProductListItem,
  ProductPriceListCode,
  ProductQueryRow,
  ProductRelation,
  ProductSortField,
  SortDirection,
} from './types';

const DEFAULT_CURRENCY = 'ARS';
const MINORISTA_PRICE_LIST_CODE = 'minorista';
const MAYORISTA_PRICE_LIST_CODE = 'mayorista';

export function mapProductRowToListItem(row: ProductQueryRow): ProductListItem {
  const category = firstRelation(row.categories);
  const brand = firstRelation(row.brands);
  const minorista = findPrice(row, MINORISTA_PRICE_LIST_CODE);

  return {
    id: row.id,
    sku: row.sku,
    productLine: row.product_line,
    name: row.name,
    variant: row.variant,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? 'Sin categoria',
    brandId: brand?.id ?? null,
    brandName: brand?.name ?? 'Sin marca',
    price: toNumber(minorista?.price),
    currency: minorista?.currency ?? DEFAULT_CURRENCY,
    isActive: row.is_active,
  };
}

export function mapProductRowToDetail(row: ProductQueryRow): ProductDetail {
  const category = firstRelation(row.categories);
  const brand = firstRelation(row.brands);

  return {
    id: row.id,
    sku: row.sku,
    productLine: row.product_line,
    name: row.name,
    variant: row.variant,
    description: row.description ?? null,
    categoryId: category?.id ?? '',
    categoryName: category?.name ?? 'Sin categoria',
    brandId: brand?.id ?? '',
    brandName: brand?.name ?? 'Sin marca',
    isActive: row.is_active,
    updatedAt: row.updated_at ?? '',
    audit: {
      createdBy: null,
      updatedBy: null,
      changeLog: [],
    },
    prices: {
      minorista: mapEditablePrice(row, MINORISTA_PRICE_LIST_CODE, 'Minorista'),
      mayorista: findPrice(row, MAYORISTA_PRICE_LIST_CODE)
        ? mapEditablePrice(row, MAYORISTA_PRICE_LIST_CODE, 'Mayorista')
        : null,
    },
  };
}

export function sortProductListItems(
  products: ProductListItem[],
  sort: ProductSortField,
  direction: SortDirection,
) {
  const sorted = [...products].sort((a, b) => {
    if (sort === 'price') {
      return comparePrices(a.price, b.price, direction);
    }

    const left = sort === 'sku' ? a.sku : a.name;
    const right = sort === 'sku' ? b.sku : b.name;
    const result = left.localeCompare(right, 'es', { sensitivity: 'base', numeric: true });

    return direction === 'asc' ? result : -result;
  });

  return sorted;
}

function findPrice(row: ProductQueryRow, code: ProductPriceListCode) {
  return row.product_prices?.find((price) => firstRelation(price.price_lists)?.code === code) ?? null;
}

function mapEditablePrice(
  row: ProductQueryRow,
  code: ProductPriceListCode,
  fallbackName: string,
): ProductEditablePrice {
  const price = findPrice(row, code);
  const priceList = firstRelation(price?.price_lists ?? null);

  return {
    id: price?.id ?? null,
    priceListId: price?.price_list_id ?? priceList?.id ?? null,
    code,
    name: priceList?.name ?? fallbackName,
    price: toNumber(price?.price),
    currency: price?.currency ?? DEFAULT_CURRENCY,
    exists: Boolean(price),
  };
}

function firstRelation<T>(relation: ProductRelation<T>) {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation;
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function comparePrices(
  left: number | null,
  right: number | null,
  direction: SortDirection,
) {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === 'asc' ? left - right : right - left;
}
