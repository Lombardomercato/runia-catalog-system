import type {
  ApplyCostPlusInput,
  ApplyBrandPricingInput,
  CopyRetailToWholesaleInput,
  NormalizedApplyCostPlus,
  NormalizedApplyBrandPricing,
  NormalizedCopyRetailToWholesale,
  NormalizedPriceListRule,
  NormalizedPricingBlock,
  NormalizedRecalculateBrandPrices,
  NormalizedRecalculatePriceList,
  NormalizedSingleProductPrice,
  PricingBrandOperation,
  PricingCoverageFilter,
  PricingFieldErrors,
  PricingListParams,
  PricingMode,
  PricingRowInput,
  RecalculateBrandPricesInput,
  RecalculatePriceListInput,
  UpdatePriceListRuleInput,
  UpdatePricingBlockInput,
  UpdateProductPricesInput,
  UpdateSingleProductPriceInput,
} from './types';

export const DEFAULT_PRICING_LIST_PARAMS: PricingListParams = {
  search: '',
  brandId: 'all',
  categoryId: 'all',
  coverage: 'all',
  page: 1,
  pageSize: 50,
};

export const PRICING_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

type SearchParamsInput = Record<string, string | string[] | undefined>;

const coverageValues = new Set<PricingCoverageFilter>([
  'all',
  'missing_minorista',
  'missing_mayorista',
]);
const brandOperations = new Set<PricingBrandOperation>([
  'increase',
  'decrease',
  'copy_retail_to_wholesale',
]);
const pricingModes = new Set<PricingMode>(['manual', 'cost_plus_percent']);

export function parsePricingListSearchParams(searchParams: SearchParamsInput): PricingListParams {
  const coverage = readParam(searchParams, 'coverage') as PricingCoverageFilter;
  const pageSize = parsePositiveInteger(readParam(searchParams, 'pageSize'), 50);

  return {
    search: readParam(searchParams, 'q').trim().slice(0, 120),
    brandId: readParam(searchParams, 'brand') || 'all',
    categoryId: readParam(searchParams, 'category') || 'all',
    coverage: coverageValues.has(coverage) ? coverage : 'all',
    page: parsePositiveInteger(readParam(searchParams, 'page'), 1),
    pageSize: PRICING_PAGE_SIZE_OPTIONS.includes(
      pageSize as (typeof PRICING_PAGE_SIZE_OPTIONS)[number],
    )
      ? pageSize
      : 50,
  };
}

export function validateUpdateProductPrices(input: UpdateProductPricesInput) {
  return validatePricingBlock({
    tenantSlug: input.tenantSlug,
    rows: [input],
  });
}

export function validateSingleProductPrice(input: UpdateSingleProductPriceInput): {
  value: NormalizedSingleProductPrice | null;
  fieldErrors: PricingFieldErrors;
} {
  const fieldErrors: PricingFieldErrors = {};
  const tenantSlug = normalizeText(input.tenantSlug);
  const productId = normalizeText(input.productId);
  const priceListCode = normalizeText(input.priceListCode) as NormalizedSingleProductPrice['priceListCode'];
  const price = parseOptionalPrice(input.price, 'price', fieldErrors);

  if (!tenantSlug) fieldErrors.tenantSlug = 'No se pudo identificar el tenant.';
  if (!productId) fieldErrors.productId = 'No se pudo identificar el producto.';
  if (priceListCode !== 'minorista' && priceListCode !== 'mayorista') {
    fieldErrors.priceListCode = 'La lista de precios no es valida.';
  }
  if (price === null && !fieldErrors.price) fieldErrors.price = 'El precio es obligatorio.';

  if (hasErrors(fieldErrors) || price === null) return { value: null, fieldErrors };

  return { value: { tenantSlug, productId, priceListCode, price }, fieldErrors };
}

export function validatePricingBlock(input: UpdatePricingBlockInput): {
  value: NormalizedPricingBlock | null;
  fieldErrors: PricingFieldErrors;
} {
  const fieldErrors: PricingFieldErrors = {};
  const tenantSlug = normalizeText(input.tenantSlug);
  const rows = Array.isArray(input.rows) ? input.rows : [];

  if (!tenantSlug) {
    fieldErrors.tenantSlug = 'No se pudo identificar el tenant.';
  }

  if (rows.length === 0) {
    fieldErrors.rows = 'Selecciona al menos un producto.';
  }

  if (rows.length > 500) {
    fieldErrors.rows = 'No se pueden actualizar mas de 500 productos por operacion.';
  }

  const normalizedRows = rows.map((row, index) => normalizePricingRow(row, index, fieldErrors));
  const productIds = normalizedRows.map((row) => row.productId).filter(Boolean);

  if (new Set(productIds).size !== productIds.length) {
    fieldErrors.rows = 'La seleccion contiene productos duplicados.';
  }

  if (hasErrors(fieldErrors)) {
    return { value: null, fieldErrors };
  }

  return {
    value: { tenantSlug, rows: normalizedRows },
    fieldErrors,
  };
}

export function validateCopyRetailToWholesale(input: CopyRetailToWholesaleInput): {
  value: NormalizedCopyRetailToWholesale | null;
  fieldErrors: PricingFieldErrors;
} {
  const fieldErrors: PricingFieldErrors = {};
  const tenantSlug = normalizeText(input.tenantSlug);
  const productIds = normalizeIds(input.productIds);
  const adjustmentPercent = parsePercentage(input.adjustmentPercent, 'adjustmentPercent', fieldErrors);

  if (!tenantSlug) fieldErrors.tenantSlug = 'No se pudo identificar el tenant.';
  if (productIds.length === 0) fieldErrors.productIds = 'Selecciona al menos un producto.';
  if (productIds.length > 500) fieldErrors.productIds = 'El limite es de 500 productos por operacion.';

  if (hasErrors(fieldErrors) || adjustmentPercent === null) {
    return { value: null, fieldErrors };
  }

  return {
    value: { tenantSlug, productIds, adjustmentPercent },
    fieldErrors,
  };
}

export function validateApplyBrandPricing(input: ApplyBrandPricingInput): {
  value: NormalizedApplyBrandPricing | null;
  fieldErrors: PricingFieldErrors;
} {
  const fieldErrors: PricingFieldErrors = {};
  const tenantSlug = normalizeText(input.tenantSlug);
  const brandId = normalizeText(input.brandId);
  const operation = normalizeText(input.operation) as PricingBrandOperation;
  const percentage = parsePercentage(input.percentage, 'percentage', fieldErrors);

  if (!tenantSlug) fieldErrors.tenantSlug = 'No se pudo identificar el tenant.';
  if (!brandId) fieldErrors.brandId = 'Selecciona una marca.';
  if (!brandOperations.has(operation)) fieldErrors.operation = 'La operacion no es valida.';

  if (percentage !== null) {
    if (operation === 'increase' && percentage < 0) {
      fieldErrors.percentage = 'El aumento debe ser un porcentaje positivo.';
    }

    if (operation === 'decrease' && (percentage < 0 || percentage > 100)) {
      fieldErrors.percentage = 'La reduccion debe estar entre 0 y 100.';
    }
  }

  if (hasErrors(fieldErrors) || percentage === null) {
    return { value: null, fieldErrors };
  }

  return {
    value: { tenantSlug, brandId, operation, percentage },
    fieldErrors,
  };
}

export function validateUpdatePriceListRule(input: UpdatePriceListRuleInput): {
  value: NormalizedPriceListRule | null;
  fieldErrors: PricingFieldErrors;
} {
  const fieldErrors: PricingFieldErrors = {};
  const tenantSlug = normalizeText(input.tenantSlug);
  const priceListCode = normalizeListCode(input.priceListCode, 'priceListCode', fieldErrors);
  const pricingMode = normalizeMode(input.pricingMode, 'pricingMode', fieldErrors);
  const marginPercent = parsePercentage(input.marginPercent, 'marginPercent', fieldErrors);

  if (!tenantSlug) fieldErrors.tenantSlug = 'No se pudo identificar el tenant.';
  if (hasErrors(fieldErrors) || !priceListCode || !pricingMode || marginPercent === null) {
    return { value: null, fieldErrors };
  }

  return { value: { tenantSlug, priceListCode, pricingMode, marginPercent }, fieldErrors };
}

export function validateRecalculatePriceList(input: RecalculatePriceListInput): {
  value: NormalizedRecalculatePriceList | null;
  fieldErrors: PricingFieldErrors;
} {
  const fieldErrors: PricingFieldErrors = {};
  const tenantSlug = normalizeText(input.tenantSlug);
  const priceListCode = normalizeListCode(input.priceListCode, 'priceListCode', fieldErrors);

  if (!tenantSlug) fieldErrors.tenantSlug = 'No se pudo identificar el tenant.';
  if (hasErrors(fieldErrors) || !priceListCode) return { value: null, fieldErrors };
  return { value: { tenantSlug, priceListCode }, fieldErrors };
}

export function validateRecalculateBrandPrices(input: RecalculateBrandPricesInput): {
  value: NormalizedRecalculateBrandPrices | null;
  fieldErrors: PricingFieldErrors;
} {
  const base = validateRecalculatePriceList(input);
  const fieldErrors = { ...base.fieldErrors };
  const brandId = normalizeText(input.brandId);
  if (!brandId) fieldErrors.brandId = 'Selecciona una marca.';
  if (!base.value || hasErrors(fieldErrors)) return { value: null, fieldErrors };
  return { value: { ...base.value, brandId }, fieldErrors };
}

export function validateApplyCostPlus(input: ApplyCostPlusInput): {
  value: NormalizedApplyCostPlus | null;
  fieldErrors: PricingFieldErrors;
} {
  const base = validateRecalculatePriceList(input);
  const fieldErrors = { ...base.fieldErrors };
  const productIds = normalizeIds(input.productIds);
  if (productIds.length === 0) fieldErrors.productIds = 'Selecciona al menos un producto.';
  if (productIds.length > 500) fieldErrors.productIds = 'El limite es de 500 productos por operacion.';
  if (!base.value || hasErrors(fieldErrors)) return { value: null, fieldErrors };
  return { value: { ...base.value, productIds }, fieldErrors };
}

function normalizePricingRow(
  row: PricingRowInput,
  index: number,
  fieldErrors: PricingFieldErrors,
) {
  const productId = normalizeText(row.productId);

  if (!productId) {
    fieldErrors[`row.${index}.productId`] = 'No se pudo identificar el producto.';
  }
  const fieldPrefix = productId || `row.${index}`;
  const cost = parseRequiredAmount(row.cost, `${fieldPrefix}.cost`, 'El costo', fieldErrors);
  const costCurrency = normalizeText(row.costCurrency).toUpperCase();
  const minoristaPricingMode = normalizeMode(
    row.minoristaPricingMode,
    `${fieldPrefix}.minoristaPricingMode`,
    fieldErrors,
  );
  const mayoristaPricingMode = normalizeMode(
    row.mayoristaPricingMode,
    `${fieldPrefix}.mayoristaPricingMode`,
    fieldErrors,
  );

  if (!/^[A-Z]{3}$/.test(costCurrency)) {
    fieldErrors[`${fieldPrefix}.costCurrency`] = 'La moneda debe usar un codigo de tres letras.';
  }

  return {
    productId,
    cost: cost ?? 0,
    costCurrency,
    minoristaPrice: parseOptionalPrice(row.minoristaPrice, `${fieldPrefix}.minoristaPrice`, fieldErrors),
    mayoristaPrice: parseOptionalPrice(row.mayoristaPrice, `${fieldPrefix}.mayoristaPrice`, fieldErrors),
    minoristaPricingMode: minoristaPricingMode ?? 'manual',
    mayoristaPricingMode: mayoristaPricingMode ?? 'manual',
    minoristaMarginOverride: parseOptionalPercentage(
      row.minoristaMarginOverride,
      `${fieldPrefix}.minoristaMarginOverride`,
      fieldErrors,
    ),
    mayoristaMarginOverride: parseOptionalPercentage(
      row.mayoristaMarginOverride,
      `${fieldPrefix}.mayoristaMarginOverride`,
      fieldErrors,
    ),
  };
}

function parseRequiredAmount(
  value: unknown,
  field: string,
  label: string,
  fieldErrors: PricingFieldErrors,
) {
  const amount = parseOptionalPrice(value, field, fieldErrors);
  if (amount === null && !fieldErrors[field]) fieldErrors[field] = `${label} es obligatorio.`;
  return amount;
}

function parseOptionalPrice(value: unknown, field: string, fieldErrors: PricingFieldErrors) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return null;
  }

  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const price = typeof normalized === 'number' ? normalized : Number.parseFloat(String(normalized));

  if (!Number.isFinite(price)) {
    fieldErrors[field] = 'El precio debe ser numerico.';
    return null;
  }

  if (price < 0) {
    fieldErrors[field] = 'El precio debe ser mayor o igual a cero.';
    return null;
  }

  return price;
}

function parsePercentage(value: unknown, field: string, fieldErrors: PricingFieldErrors) {
  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const percentage = typeof normalized === 'number' ? normalized : Number.parseFloat(String(normalized));

  if (!Number.isFinite(percentage)) {
    fieldErrors[field] = 'El porcentaje debe ser numerico.';
    return null;
  }

  if (percentage < -100 || percentage > 500) {
    fieldErrors[field] = 'El porcentaje debe estar entre -100 y 500.';
    return null;
  }

  return percentage;
}

function parseOptionalPercentage(value: unknown, field: string, fieldErrors: PricingFieldErrors) {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  return parsePercentage(value, field, fieldErrors);
}

function normalizeMode(value: unknown, field: string, fieldErrors: PricingFieldErrors) {
  const mode = normalizeText(value) as PricingMode;
  if (!pricingModes.has(mode)) {
    fieldErrors[field] = 'El modo de precio no es valido.';
    return null;
  }
  return mode;
}

function normalizeListCode(value: unknown, field: string, fieldErrors: PricingFieldErrors) {
  const code = normalizeText(value);
  if (code !== 'minorista' && code !== 'mayorista') {
    fieldErrors[field] = 'La lista de precios no es valida.';
    return null;
  }
  return code;
}

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeText).filter(Boolean))];
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readParam(searchParams: SearchParamsInput, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function parsePositiveInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasErrors(fieldErrors: PricingFieldErrors) {
  return Object.keys(fieldErrors).length > 0;
}
