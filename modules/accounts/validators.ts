import type {
  AccountCommandFieldErrors,
  AccountListParams,
  AccountStatusFilter,
  CreateAccountInput,
  NormalizedAccountInput,
  NormalizedUpdateAccountPriceListInput,
  NormalizedUpdateAccountStatusInput,
  UpdateAccountInput,
  UpdateAccountPriceListInput,
  UpdateAccountStatusInput,
} from './types';

export const DEFAULT_ACCOUNT_LIST_PARAMS: AccountListParams = {
  search: '',
  status: 'all',
  priceListId: 'all',
  page: 1,
  pageSize: 12,
};

export const ACCOUNT_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;

type SearchParamsInput = Record<string, string | string[] | undefined>;

const accountStatusValues = new Set<AccountStatusFilter>([
  'all',
  'active',
  'inactive',
  'pending',
  'blocked',
]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const whatsappPattern = /^\+?[0-9\s().-]{7,24}$/;
const taxIdPattern = /^[0-9-]{8,16}$/;

export function parseAccountListSearchParams(searchParams: SearchParamsInput): AccountListParams {
  const search = readParam(searchParams, 'q').trim().slice(0, 120);
  const status = parseStatus(readParam(searchParams, 'status'));
  const priceListId = readParam(searchParams, 'priceList') || DEFAULT_ACCOUNT_LIST_PARAMS.priceListId;
  const page = parsePositiveInteger(readParam(searchParams, 'page'), DEFAULT_ACCOUNT_LIST_PARAMS.page);
  const pageSize = parsePageSize(readParam(searchParams, 'pageSize'));

  return {
    search,
    status,
    priceListId,
    page,
    pageSize,
  };
}

export function validateCreateAccountInput(input: CreateAccountInput): {
  value: NormalizedAccountInput | null;
  fieldErrors: AccountCommandFieldErrors;
} {
  return validateAccountFields(input);
}

export function validateUpdateAccountInput(input: UpdateAccountInput): {
  value: NormalizedAccountInput | null;
  fieldErrors: AccountCommandFieldErrors;
} {
  const result = validateAccountFields(input);
  const accountId = normalizeRequiredText(input.accountId);

  if (!accountId) {
    result.fieldErrors.accountId = 'No se pudo identificar la account.';
  }

  if (!result.value || hasFieldErrors(result.fieldErrors)) {
    return { value: null, fieldErrors: result.fieldErrors };
  }

  return {
    value: {
      ...result.value,
      accountId,
    },
    fieldErrors: result.fieldErrors,
  };
}

export function validateUpdateAccountPriceListInput(
  input: UpdateAccountPriceListInput,
): {
  value: NormalizedUpdateAccountPriceListInput | null;
  fieldErrors: AccountCommandFieldErrors;
} {
  const fieldErrors: AccountCommandFieldErrors = {};
  const tenantSlug = normalizeRequiredText(input.tenantSlug);
  const accountId = normalizeRequiredText(input.accountId);

  if (!tenantSlug) {
    fieldErrors.tenantSlug = 'El tenant es obligatorio.';
  }

  if (!accountId) {
    fieldErrors.accountId = 'No se pudo identificar la account.';
  }

  if (hasFieldErrors(fieldErrors)) {
    return { value: null, fieldErrors };
  }

  return {
    value: {
      tenantSlug,
      accountId,
      priceListId: normalizeOptionalText(input.priceListId),
    },
    fieldErrors,
  };
}

export function validateUpdateAccountStatusInput(input: UpdateAccountStatusInput): {
  value: NormalizedUpdateAccountStatusInput | null;
  fieldErrors: AccountCommandFieldErrors;
} {
  const fieldErrors: AccountCommandFieldErrors = {};
  const tenantSlug = normalizeRequiredText(input.tenantSlug);
  const accountId = normalizeRequiredText(input.accountId);

  if (!tenantSlug) {
    fieldErrors.tenantSlug = 'El tenant es obligatorio.';
  }

  if (!accountId) {
    fieldErrors.accountId = 'No se pudo identificar la account.';
  }

  if (typeof input.isActive !== 'boolean') {
    fieldErrors.isActive = 'El estado debe ser activo o inactivo.';
  }

  if (hasFieldErrors(fieldErrors)) {
    return { value: null, fieldErrors };
  }

  return {
    value: {
      tenantSlug,
      accountId,
      isActive: input.isActive,
    },
    fieldErrors,
  };
}

function validateAccountFields(input: CreateAccountInput): {
  value: NormalizedAccountInput | null;
  fieldErrors: AccountCommandFieldErrors;
} {
  const fieldErrors: AccountCommandFieldErrors = {};
  const tenantSlug = normalizeRequiredText(input.tenantSlug);
  const name = normalizeRequiredText(input.name);
  const email = normalizeOptionalText(input.email);
  const whatsapp = normalizeOptionalText(input.whatsapp);
  const taxId = normalizeOptionalText(input.taxId);
  const discountPercent = parseDiscount(input.discountPercent, fieldErrors);

  if (!tenantSlug) {
    fieldErrors.tenantSlug = 'El tenant es obligatorio.';
  }

  if (!name) {
    fieldErrors.name = 'El nombre es obligatorio.';
  }

  if (email && !emailPattern.test(email)) {
    fieldErrors.email = 'El email no tiene un formato valido.';
  }

  if (whatsapp && !whatsappPattern.test(whatsapp)) {
    fieldErrors.whatsapp = 'El WhatsApp debe contener solo numeros, espacios o simbolos telefonicos.';
  }

  if (taxId && !taxIdPattern.test(taxId)) {
    fieldErrors.taxId = 'El CUIT debe contener numeros y guiones.';
  }

  if (typeof input.isActive !== 'boolean') {
    fieldErrors.isActive = 'El estado debe ser activo o inactivo.';
  }

  if (hasFieldErrors(fieldErrors) || discountPercent === null) {
    return { value: null, fieldErrors };
  }

  return {
    value: {
      tenantSlug,
      name,
      legalName: normalizeOptionalText(input.legalName),
      taxId,
      whatsapp,
      email,
      address: normalizeOptionalText(input.address),
      priceListId: normalizeOptionalText(input.priceListId),
      discountPercent,
      isActive: input.isActive,
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

function parseStatus(value: string): AccountStatusFilter {
  return accountStatusValues.has(value as AccountStatusFilter)
    ? (value as AccountStatusFilter)
    : DEFAULT_ACCOUNT_LIST_PARAMS.status;
}

function parsePageSize(value: string) {
  const parsed = parsePositiveInteger(value, DEFAULT_ACCOUNT_LIST_PARAMS.pageSize);

  return ACCOUNT_PAGE_SIZE_OPTIONS.includes(parsed as (typeof ACCOUNT_PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : DEFAULT_ACCOUNT_LIST_PARAMS.pageSize;
}

function parsePositiveInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function parseDiscount(value: unknown, fieldErrors: AccountCommandFieldErrors) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return 0;
  }

  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const parsed = typeof normalized === 'number' ? normalized : Number.parseFloat(String(normalized));

  if (!Number.isFinite(parsed)) {
    fieldErrors.discountPercent = 'El descuento debe ser numerico.';
    return null;
  }

  if (parsed < 0 || parsed > 100) {
    fieldErrors.discountPercent = 'El descuento debe estar entre 0 y 100.';
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

function hasFieldErrors(fieldErrors: AccountCommandFieldErrors) {
  return Object.keys(fieldErrors).length > 0;
}
