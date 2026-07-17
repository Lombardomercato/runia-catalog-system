import {
  DEFAULT_COMMERCE_TENANT_PRICE_LISTS,
  DEFAULT_COMMERCE_TENANT_SETUP_FEATURES,
  tenantSetupFailure,
  type CommerceTenantPriceListInput,
  type CommerceTenantPricingMode,
  type CommerceTenantSetupFeatures,
  type CommerceTenantSetupInput,
  type PreparedCommerceTenantPriceList,
  type PreparedCommerceTenantSetup,
  type TenantSetupResult,
} from '../setup';

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const PRICE_LIST_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class PrepareTenantDefaults {
  execute(
    input: CommerceTenantSetupInput,
  ): TenantSetupResult<PreparedCommerceTenantSetup> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return tenantSetupFailure('INVALID_INPUT', 'La configuración inicial no es válida.');
    }

    const fieldErrors: Record<string, string> = {};
    const name = requiredText(input.name, 160, 'name', 'El nombre comercial es obligatorio.', fieldErrors);
    const slug = normalizeTenantSetupSlug(input.slug);
    const legalName = optionalText(input.legalName, 200, 'legalName', fieldErrors);
    const email = optionalText(input.email, 254, 'email', fieldErrors);
    const whatsapp = normalizeWhatsApp(input.whatsapp, fieldErrors);
    const currency = normalizeCurrency(input.currency, fieldErrors);
    const locale = normalizeLocale(input.locale, fieldErrors);
    const status = input.status ?? 'active';
    const minimumOrderAmount = normalizeAmount(
      input.minimumOrderAmount,
      'minimumOrderAmount',
      fieldErrors,
    );
    const minimumPurchaseAmount = normalizeAmount(
      input.minimumPurchaseAmount,
      'minimumPurchaseAmount',
      fieldErrors,
    );
    const logoUrl = normalizeUrl(input.logoUrl, fieldErrors);
    const primaryColor = normalizeColor(
      input.primaryColor,
      '#14b8a6',
      'primaryColor',
      fieldErrors,
    );
    const secondaryColor = normalizeColor(
      input.secondaryColor,
      '#0f172a',
      'secondaryColor',
      fieldErrors,
    );
    const features = normalizeFeatures(input.features);
    const priceLists = normalizePriceLists(input.priceLists, fieldErrors);

    if (!slug) {
      fieldErrors.slug = 'El slug es obligatorio.';
    } else if (slug.length > 120) {
      fieldErrors.slug = 'El slug no puede superar 120 caracteres.';
    }
    if (email && !EMAIL_PATTERN.test(email)) {
      fieldErrors.email = 'Ingresa un email válido.';
    }
    if (status !== 'active' && status !== 'setup') {
      fieldErrors.status = 'El estado debe ser active o setup.';
    }

    if (
      Object.keys(fieldErrors).length > 0 ||
      name === null ||
      minimumOrderAmount === null ||
      minimumPurchaseAmount === null ||
      priceLists === null
    ) {
      return tenantSetupFailure(
        'INVALID_INPUT',
        'Hay campos de configuración que necesitan revisión.',
        fieldErrors,
      );
    }

    return {
      ok: true,
      value: {
        name,
        slug,
        legalName,
        email,
        whatsapp,
        currency,
        locale,
        status,
        minimumOrderAmount,
        minimumPurchaseAmount,
        logoUrl,
        primaryColor,
        secondaryColor,
        features,
        priceLists,
      },
    };
  }
}

function normalizePriceLists(
  input: CommerceTenantPriceListInput[] | undefined,
  fieldErrors: Record<string, string>,
): PreparedCommerceTenantPriceList[] | null {
  const source = input === undefined
    ? DEFAULT_COMMERCE_TENANT_PRICE_LISTS.map((priceList) => ({ ...priceList }))
    : input;
  if (!Array.isArray(source) || source.length === 0 || source.length > 10) {
    fieldErrors.priceLists = 'Configura entre 1 y 10 listas de precios.';
    return null;
  }

  const normalized = source.map((priceList, index) =>
    normalizePriceList(priceList, index, fieldErrors),
  );
  const valid = normalized.filter(
    (priceList): priceList is PreparedCommerceTenantPriceList => priceList !== null,
  );
  const codes = valid.map((priceList) => priceList.code);
  if (new Set(codes).size !== codes.length) {
    fieldErrors.priceLists = 'Los códigos de listas de precios no pueden repetirse.';
  }
  if (valid.filter((priceList) => priceList.isDefault).length !== 1) {
    fieldErrors.priceLists = 'Debe existir una única lista de precios predeterminada.';
  }
  if (valid.some((priceList) => priceList.isDefault && !priceList.active)) {
    fieldErrors.priceLists = 'La lista predeterminada debe estar activa.';
  }
  return valid.length === source.length ? valid : null;
}

function normalizePriceList(
  input: CommerceTenantPriceListInput,
  index: number,
  fieldErrors: Record<string, string>,
): PreparedCommerceTenantPriceList | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fieldErrors[`priceLists.${index}`] = 'La lista no es válida.';
    return null;
  }
  const name = requiredText(
    input.name,
    100,
    `priceLists.${index}.name`,
    'El nombre de la lista es obligatorio.',
    fieldErrors,
  );
  const code = normalizeTenantSetupSlug(input.code);
  const pricingMode: CommerceTenantPricingMode = input.pricingMode ?? 'manual';
  const marginPercent = normalizeMargin(
    input.marginPercent,
    `priceLists.${index}.marginPercent`,
    fieldErrors,
  );
  if (!code || code.length > 80 || !PRICE_LIST_CODE_PATTERN.test(code)) {
    fieldErrors[`priceLists.${index}.code`] =
      'Usa un código con minúsculas, números y guiones.';
  }
  if (pricingMode !== 'manual' && pricingMode !== 'cost_plus_percent') {
    fieldErrors[`priceLists.${index}.pricingMode`] = 'El modo de pricing no es válido.';
  }
  if (!name || !code || marginPercent === null) return null;
  return {
    name,
    code,
    active: input.active !== false,
    isDefault: input.isDefault === true,
    pricingMode,
    marginPercent,
  };
}

function normalizeFeatures(
  input: Partial<CommerceTenantSetupFeatures> | undefined,
): CommerceTenantSetupFeatures {
  const defaults = DEFAULT_COMMERCE_TENANT_SETUP_FEATURES;
  return {
    showPrices: input?.showPrices ?? defaults.showPrices,
    publicCatalog: input?.publicCatalog ?? defaults.publicCatalog,
    orders: input?.orders ?? defaults.orders,
    importer: input?.importer ?? defaults.importer,
    multiplePriceLists: input?.multiplePriceLists ?? defaults.multiplePriceLists,
    images: input?.images ?? defaults.images,
    wholesaleLogin: input?.wholesaleLogin ?? defaults.wholesaleLogin,
  };
}

function requiredText(
  value: unknown,
  maxLength: number,
  field: string,
  requiredMessage: string,
  fieldErrors: Record<string, string>,
) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    fieldErrors[field] = requiredMessage;
    return null;
  }
  if (normalized.length > maxLength) {
    fieldErrors[field] = `No puede superar ${maxLength} caracteres.`;
    return null;
  }
  return normalized;
}

function optionalText(
  value: unknown,
  maxLength: number,
  field: string,
  fieldErrors: Record<string, string>,
) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized.length > maxLength) {
    fieldErrors[field] = `No puede superar ${maxLength} caracteres.`;
  }
  return normalized || null;
}

export function normalizeTenantSetupSlug(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeWhatsApp(value: unknown, fieldErrors: Record<string, string>) {
  if (value === null || value === undefined || value === '') return null;
  const digits = String(value).replace(/\D/g, '').replace(/^00/, '');
  if (digits.length < 8 || digits.length > 15) {
    fieldErrors.whatsapp = 'Ingresa un WhatsApp con código de país, entre 8 y 15 dígitos.';
    return null;
  }
  return `+${digits}`;
}

function normalizeCurrency(value: unknown, fieldErrors: Record<string, string>) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : 'ARS';
  if (!/^[A-Z]{3}$/.test(normalized)) {
    fieldErrors.currency = 'La moneda debe usar un código ISO de 3 letras.';
  }
  return normalized;
}

function normalizeLocale(value: unknown, fieldErrors: Record<string, string>) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : 'es-AR';
  const [language, region] = raw.split('-');
  const normalized = region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase();
  if (!LOCALE_PATTERN.test(normalized)) {
    fieldErrors.locale = 'Usa un locale como es-AR o en-US.';
  }
  return normalized;
}

function normalizeAmount(
  value: number | string | null | undefined,
  field: string,
  fieldErrors: Record<string, string>,
) {
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const parsed = normalized === null || normalized === undefined || normalized === ''
    ? 0
    : Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000_000_000) {
    fieldErrors[field] = 'Ingresa un monto válido mayor o igual a cero.';
    return null;
  }
  return parsed;
}

function normalizeMargin(
  value: number | string | null | undefined,
  field: string,
  fieldErrors: Record<string, string>,
) {
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const parsed = normalized === null || normalized === undefined || normalized === ''
    ? 0
    : Number(normalized);
  if (!Number.isFinite(parsed) || parsed < -100 || parsed > 500) {
    fieldErrors[field] = 'El margen debe estar entre -100 y 500.';
    return null;
  }
  return parsed;
}

function normalizeUrl(value: unknown, fieldErrors: Record<string, string>) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;
  if (normalized.length > 2048) {
    fieldErrors.logoUrl = 'La URL del logo es demasiado larga.';
    return null;
  }
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
    return normalized;
  } catch {
    fieldErrors.logoUrl = 'La URL del logo debe comenzar con http:// o https://.';
    return null;
  }
}

function normalizeColor(
  value: unknown,
  fallback: string,
  field: string,
  fieldErrors: Record<string, string>,
) {
  const normalized = typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : fallback;
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    fieldErrors[field] = 'Usa un color HEX de 6 dígitos.';
  }
  return normalized;
}
