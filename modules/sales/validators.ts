import type {
  CreateSalesOrderInput,
  DuplicateSalesOrderInput,
  NormalizedSalesOrderInput,
  SalesCommandFieldErrors,
  SalesListParams,
  SalesOrderStatus,
  SalesOrderStatusFilter,
  UpdateSalesOrderInput,
} from './types';
import { SALES_ORDER_STATUSES } from './types';

export const DEFAULT_SALES_LIST_PARAMS: SalesListParams = {
  search: '',
  status: 'all',
  page: 1,
  pageSize: 12,
};

export const SALES_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;

type SearchParamsInput = Record<string, string | string[] | undefined>;

const statusValues = new Set<string>(SALES_ORDER_STATUSES);
const statusFilterValues = new Set<SalesOrderStatusFilter>(['all', ...SALES_ORDER_STATUSES]);

export function parseSalesListSearchParams(searchParams: SearchParamsInput): SalesListParams {
  const search = readParam(searchParams, 'q').trim().slice(0, 120);
  const status = parseStatusFilter(readParam(searchParams, 'status'));
  const page = parsePositiveInteger(readParam(searchParams, 'page'), DEFAULT_SALES_LIST_PARAMS.page);
  const pageSize = parsePageSize(readParam(searchParams, 'pageSize'));

  return {
    search,
    status,
    page,
    pageSize,
  };
}

export function validateCreateSalesOrderInput(input: CreateSalesOrderInput): {
  value: NormalizedSalesOrderInput | null;
  fieldErrors: SalesCommandFieldErrors;
} {
  return validateSalesOrderFields(input);
}

export function validateUpdateSalesOrderInput(input: UpdateSalesOrderInput): {
  value: NormalizedSalesOrderInput | null;
  fieldErrors: SalesCommandFieldErrors;
} {
  const result = validateSalesOrderFields(input);
  const orderId = normalizeRequiredText(input.orderId);

  if (!orderId) {
    result.fieldErrors.orderId = 'No se pudo identificar el pedido.';
  }

  if (!result.value || hasFieldErrors(result.fieldErrors)) {
    return {
      value: null,
      fieldErrors: result.fieldErrors,
    };
  }

  return {
    value: {
      ...result.value,
      orderId,
    },
    fieldErrors: result.fieldErrors,
  };
}

export function validateDuplicateSalesOrderInput(input: DuplicateSalesOrderInput): {
  value: DuplicateSalesOrderInput | null;
  fieldErrors: SalesCommandFieldErrors;
} {
  const fieldErrors: SalesCommandFieldErrors = {};
  const tenantSlug = normalizeRequiredText(input.tenantSlug);
  const orderId = normalizeRequiredText(input.orderId);

  if (!tenantSlug) {
    fieldErrors.tenantSlug = 'El tenant es obligatorio.';
  }

  if (!orderId) {
    fieldErrors.orderId = 'No se pudo identificar el pedido a duplicar.';
  }

  if (hasFieldErrors(fieldErrors)) {
    return { value: null, fieldErrors };
  }

  return {
    value: { tenantSlug, orderId },
    fieldErrors,
  };
}

function validateSalesOrderFields(input: CreateSalesOrderInput): {
  value: NormalizedSalesOrderInput | null;
  fieldErrors: SalesCommandFieldErrors;
} {
  const fieldErrors: SalesCommandFieldErrors = {};
  const tenantSlug = normalizeRequiredText(input.tenantSlug);
  const accountId = normalizeRequiredText(input.accountId);
  const priceListId = normalizeOptionalText(input.priceListId);
  const status = normalizeRequiredText(input.status) as SalesOrderStatus;
  const items = Array.isArray(input.items) ? input.items : [];

  if (!tenantSlug) {
    fieldErrors.tenantSlug = 'El tenant es obligatorio.';
  }

  if (!accountId) {
    fieldErrors.accountId = 'Selecciona una account para el pedido.';
  }

  if (!statusValues.has(status)) {
    fieldErrors.status = 'El estado del pedido no es valido.';
  }

  if (items.length === 0) {
    fieldErrors.items = 'Agrega al menos un producto al pedido.';
  }

  const normalizedItems = items.map((item, index) => {
    const productId = normalizeRequiredText(item.productId);
    const quantity = parseQuantity(item.quantity, index, fieldErrors);

    if (!productId) {
      fieldErrors[`item.${index}.productId`] = 'Selecciona un producto.';
    }

    return {
      itemId: normalizeOptionalText(item.itemId),
      productId,
      quantity: quantity ?? 0,
    };
  });

  if (hasFieldErrors(fieldErrors)) {
    return {
      value: null,
      fieldErrors,
    };
  }

  return {
    value: {
      tenantSlug,
      accountId,
      priceListId,
      status,
      notes: normalizeOptionalText(input.notes),
      items: normalizedItems,
    },
    fieldErrors,
  };
}

function readParam(searchParams: SearchParamsInput, key: string) {
  const value = searchParams[key];

  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function parseStatusFilter(value: string): SalesOrderStatusFilter {
  return statusFilterValues.has(value as SalesOrderStatusFilter)
    ? (value as SalesOrderStatusFilter)
    : DEFAULT_SALES_LIST_PARAMS.status;
}

function parsePageSize(value: string) {
  const parsed = parsePositiveInteger(value, DEFAULT_SALES_LIST_PARAMS.pageSize);

  return SALES_PAGE_SIZE_OPTIONS.includes(parsed as (typeof SALES_PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : DEFAULT_SALES_LIST_PARAMS.pageSize;
}

function parsePositiveInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function parseQuantity(
  value: unknown,
  index: number,
  fieldErrors: SalesCommandFieldErrors,
) {
  if (value === null || typeof value === 'undefined' || value === '') {
    fieldErrors[`item.${index}.quantity`] = 'La cantidad es obligatoria.';
    return null;
  }

  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const parsed = typeof normalized === 'number' ? normalized : Number.parseFloat(String(normalized));

  if (!Number.isFinite(parsed)) {
    fieldErrors[`item.${index}.quantity`] = 'La cantidad debe ser numerica.';
    return null;
  }

  if (parsed <= 0) {
    fieldErrors[`item.${index}.quantity`] = 'La cantidad debe ser mayor a cero.';
    return null;
  }

  return parsed;
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

function hasFieldErrors(fieldErrors: SalesCommandFieldErrors) {
  return Object.keys(fieldErrors).length > 0;
}
