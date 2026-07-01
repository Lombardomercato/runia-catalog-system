import type {
  NormalizedUpdateProductInput,
  NormalizedUpdateProductPriceInput,
  NormalizedUpdateProductStatusInput,
  ProductCommandFieldErrors,
  ProductListParams,
  ProductPriceListCode,
  ProductSortField,
  ProductStatusFilter,
  SortDirection,
  UpdateProductInput,
  UpdateProductPriceInput,
  UpdateProductStatusInput,
} from './types';

export const DEFAULT_PRODUCT_LIST_PARAMS: ProductListParams = {
  search: '',
  categoryId: 'all',
  brandId: 'all',
  status: 'all',
  sort: 'sku',
  direction: 'asc',
  page: 1,
  pageSize: 12,
};

export const PRODUCT_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;

type SearchParamsInput = Record<string, string | string[] | undefined>;

const productStatusValues = new Set<ProductStatusFilter>(['all', 'active', 'inactive']);
const productSortValues = new Set<ProductSortField>(['sku', 'name', 'price']);
const sortDirectionValues = new Set<SortDirection>(['asc', 'desc']);
const priceListCodeValues = new Set<ProductPriceListCode>(['minorista', 'mayorista']);

export function parseProductListSearchParams(searchParams: SearchParamsInput): ProductListParams {
  const search = readParam(searchParams, 'q').trim().slice(0, 120);
  const categoryId = readParam(searchParams, 'category') || DEFAULT_PRODUCT_LIST_PARAMS.categoryId;
  const brandId = readParam(searchParams, 'brand') || DEFAULT_PRODUCT_LIST_PARAMS.brandId;
  const status = parseStatus(readParam(searchParams, 'status'));
  const sort = parseSort(readParam(searchParams, 'sort'));
  const direction = parseDirection(readParam(searchParams, 'dir'));
  const page = parsePositiveInteger(readParam(searchParams, 'page'), DEFAULT_PRODUCT_LIST_PARAMS.page);
  const pageSize = parsePageSize(readParam(searchParams, 'pageSize'));

  return {
    search,
    categoryId,
    brandId,
    status,
    sort,
    direction,
    page,
    pageSize,
  };
}

function readParam(searchParams: SearchParamsInput, key: string) {
  const value = searchParams[key];

  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function parseStatus(value: string): ProductStatusFilter {
  return productStatusValues.has(value as ProductStatusFilter)
    ? (value as ProductStatusFilter)
    : DEFAULT_PRODUCT_LIST_PARAMS.status;
}

function parseSort(value: string): ProductSortField {
  return productSortValues.has(value as ProductSortField)
    ? (value as ProductSortField)
    : DEFAULT_PRODUCT_LIST_PARAMS.sort;
}

function parseDirection(value: string): SortDirection {
  return sortDirectionValues.has(value as SortDirection)
    ? (value as SortDirection)
    : DEFAULT_PRODUCT_LIST_PARAMS.direction;
}

function parsePageSize(value: string) {
  const parsed = parsePositiveInteger(value, DEFAULT_PRODUCT_LIST_PARAMS.pageSize);

  return PRODUCT_PAGE_SIZE_OPTIONS.includes(parsed as (typeof PRODUCT_PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : DEFAULT_PRODUCT_LIST_PARAMS.pageSize;
}

function parsePositiveInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

export function validateUpdateProductInput(input: UpdateProductInput): {
  value: NormalizedUpdateProductInput | null;
  fieldErrors: ProductCommandFieldErrors;
} {
  const fieldErrors: ProductCommandFieldErrors = {};
  const tenantSlug = normalizeRequiredText(input.tenantSlug);
  const productId = normalizeRequiredText(input.productId);
  const sku = normalizeRequiredText(input.sku);
  const name = normalizeRequiredText(input.name);
  const brandId = normalizeRequiredText(input.brandId);
  const categoryId = normalizeRequiredText(input.categoryId);
  const minoristaPrice = parsePrice(input.minoristaPrice, 'minoristaPrice', true, fieldErrors);
  const shouldUpdateMayoristaPrice = input.shouldUpdateMayoristaPrice === true;
  const mayoristaPrice = shouldUpdateMayoristaPrice
    ? parsePrice(input.mayoristaPrice ?? null, 'mayoristaPrice', true, fieldErrors)
    : null;

  if (!tenantSlug) {
    fieldErrors.productId = 'No se pudo identificar el cliente.';
  }

  if (!productId) {
    fieldErrors.productId = 'No se pudo identificar el producto.';
  }

  if (!sku) {
    fieldErrors.sku = 'El SKU es obligatorio y no puede modificarse.';
  }

  if (!name) {
    fieldErrors.name = 'El nombre es obligatorio.';
  }

  if (!brandId) {
    fieldErrors.brandId = 'La marca es obligatoria.';
  }

  if (!categoryId) {
    fieldErrors.categoryId = 'La categoria es obligatoria.';
  }

  if (hasFieldErrors(fieldErrors) || minoristaPrice === null || mayoristaPrice === null && shouldUpdateMayoristaPrice) {
    return {
      value: null,
      fieldErrors,
    };
  }

  return {
    value: {
      tenantSlug,
      productId,
      sku,
      name,
      productLine: normalizeOptionalText(input.productLine),
      brandId,
      categoryId,
      variant: normalizeOptionalText(input.variant),
      description: normalizeOptionalText(input.description),
      isActive: input.isActive === true,
      minoristaPrice,
      mayoristaPrice,
      shouldUpdateMayoristaPrice,
    },
    fieldErrors,
  };
}

export function validateUpdateProductPriceInput(input: UpdateProductPriceInput): {
  value: NormalizedUpdateProductPriceInput | null;
  fieldErrors: ProductCommandFieldErrors;
} {
  const fieldErrors: ProductCommandFieldErrors = {};
  const tenantSlug = normalizeRequiredText(input.tenantSlug);
  const productId = normalizeRequiredText(input.productId);
  const priceListCode = normalizeRequiredText(input.priceListCode) as ProductPriceListCode;
  const priceField = priceListCode === 'mayorista' ? 'mayoristaPrice' : 'minoristaPrice';
  const price = parsePrice(input.price, priceField, true, fieldErrors);

  if (!tenantSlug) {
    fieldErrors.productId = 'No se pudo identificar el cliente.';
  }

  if (!productId) {
    fieldErrors.productId = 'No se pudo identificar el producto.';
  }

  if (!priceListCodeValues.has(priceListCode)) {
    fieldErrors[priceField] = 'La lista de precio no es valida.';
  }

  if (hasFieldErrors(fieldErrors) || price === null) {
    return {
      value: null,
      fieldErrors,
    };
  }

  return {
    value: {
      tenantSlug,
      productId,
      priceListCode,
      price,
    },
    fieldErrors,
  };
}

export function validateUpdateProductStatusInput(input: UpdateProductStatusInput): {
  value: NormalizedUpdateProductStatusInput | null;
  fieldErrors: ProductCommandFieldErrors;
} {
  const fieldErrors: ProductCommandFieldErrors = {};
  const tenantSlug = normalizeRequiredText(input.tenantSlug);
  const productId = normalizeRequiredText(input.productId);

  if (!tenantSlug) {
    fieldErrors.productId = 'No se pudo identificar el cliente.';
  }

  if (!productId) {
    fieldErrors.productId = 'No se pudo identificar el producto.';
  }

  if (typeof input.isActive !== 'boolean') {
    fieldErrors.isActive = 'El estado debe ser activo o inactivo.';
  }

  if (hasFieldErrors(fieldErrors)) {
    return {
      value: null,
      fieldErrors,
    };
  }

  return {
    value: {
      tenantSlug,
      productId,
      isActive: input.isActive,
    },
    fieldErrors,
  };
}

function normalizeRequiredText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  return normalized ? normalized : null;
}

function parsePrice(
  value: unknown,
  field: 'minoristaPrice' | 'mayoristaPrice',
  required: boolean,
  fieldErrors: ProductCommandFieldErrors,
) {
  if (value === null || typeof value === 'undefined' || value === '') {
    if (required) {
      fieldErrors[field] = 'El precio es obligatorio.';
    }

    return null;
  }

  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const parsed = typeof normalized === 'number' ? normalized : Number.parseFloat(String(normalized));

  if (!Number.isFinite(parsed)) {
    fieldErrors[field] = 'El precio debe ser numerico.';
    return null;
  }

  if (parsed < 0) {
    fieldErrors[field] = 'El precio debe ser mayor o igual a cero.';
    return null;
  }

  return parsed;
}

function hasFieldErrors(fieldErrors: ProductCommandFieldErrors) {
  return Object.keys(fieldErrors).length > 0;
}
