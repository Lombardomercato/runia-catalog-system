import type { CommerceProductSort } from '@/sdk/server/types';

export type CatalogListParams = {
  search: string;
  categoryId: string;
  brandId: string;
  sort: CommerceProductSort;
};

type SearchParamsInput = Record<string, string | string[] | undefined>;

const sortValues = new Set<CommerceProductSort>([
  'name_asc',
  'name_desc',
  'price_asc',
  'price_desc',
  'sku_asc',
]);

export function parseCatalogSearchParams(
  searchParams: SearchParamsInput,
): CatalogListParams {
  const sort = readParam(searchParams, 'sort') as CommerceProductSort;
  return {
    search: normalizeSearchInput(readParam(searchParams, 'q')),
    categoryId: normalizeFilterId(readParam(searchParams, 'category')),
    brandId: normalizeFilterId(readParam(searchParams, 'brand')),
    sort: sortValues.has(sort) ? sort : 'name_asc',
  };
}

function normalizeSearchInput(value: string) {
  return value.trim().replace(/[%,()]/g, ' ').replace(/\s+/g, ' ').slice(0, 100);
}

function normalizeFilterId(value: string) {
  const normalized = value.trim();
  return /^[0-9a-f-]{36}$/i.test(normalized) ? normalized : 'all';
}

function readParam(searchParams: SearchParamsInput, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
