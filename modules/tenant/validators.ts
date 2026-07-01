import type {
  NormalizedUpdateBrandingInput,
  NormalizedUpdateCommercialSettingsInput,
  NormalizedUpdateFeatureFlagsInput,
  NormalizedUpdateTenantInput,
  TenantCommandFieldErrors,
  TenantFeatureFlags,
  UpdateBrandingInput,
  UpdateCommercialSettingsInput,
  UpdateFeatureFlagsInput,
  UpdateTenantInput,
} from './types';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const whatsappPattern = /^\+?[0-9\s().-]{7,24}$/;
const colorPattern = /^#[0-9a-fA-F]{6}$/;
const currencyPattern = /^[A-Z]{3}$/;

export function validateUpdateTenantInput(input: UpdateTenantInput): {
  value: NormalizedUpdateTenantInput | null;
  fieldErrors: TenantCommandFieldErrors;
} {
  const fieldErrors: TenantCommandFieldErrors = {};
  const tenantSlug = normalizeRequiredText(input.tenantSlug);
  const commercialName = normalizeRequiredText(input.commercialName);
  const email = normalizeOptionalText(input.email);
  const whatsapp = normalizeOptionalText(input.whatsapp);
  const website = normalizeOptionalText(input.website);

  if (!tenantSlug) {
    fieldErrors.tenantSlug = 'El tenant es obligatorio.';
  }

  if (!commercialName) {
    fieldErrors.commercialName = 'El nombre comercial es obligatorio.';
  }

  if (email && !emailPattern.test(email)) {
    fieldErrors.email = 'El email no tiene un formato valido.';
  }

  if (whatsapp && !whatsappPattern.test(whatsapp)) {
    fieldErrors.whatsapp = 'El WhatsApp debe contener solo numeros, espacios o simbolos telefonicos.';
  }

  if (website && !isValidUrl(website)) {
    fieldErrors.website = 'El sitio web debe ser una URL valida.';
  }

  if (hasFieldErrors(fieldErrors)) {
    return { value: null, fieldErrors };
  }

  return {
    value: {
      tenantSlug,
      commercialName,
      legalName: normalizeOptionalText(input.legalName),
      email,
      whatsapp,
      address: normalizeOptionalText(input.address),
      website,
    },
    fieldErrors,
  };
}

export function validateUpdateBrandingInput(input: UpdateBrandingInput): {
  value: NormalizedUpdateBrandingInput | null;
  fieldErrors: TenantCommandFieldErrors;
} {
  const fieldErrors: TenantCommandFieldErrors = {};
  const tenantSlug = normalizeRequiredText(input.tenantSlug);
  const primaryColor = normalizeRequiredText(input.primaryColor);
  const secondaryColor = normalizeRequiredText(input.secondaryColor);

  if (!tenantSlug) {
    fieldErrors.tenantSlug = 'El tenant es obligatorio.';
  }

  if (!colorPattern.test(primaryColor)) {
    fieldErrors.primaryColor = 'El color principal debe tener formato HEX, por ejemplo #14b8a6.';
  }

  if (!colorPattern.test(secondaryColor)) {
    fieldErrors.secondaryColor = 'El color secundario debe tener formato HEX, por ejemplo #0f172a.';
  }

  if (hasFieldErrors(fieldErrors)) {
    return { value: null, fieldErrors };
  }

  return {
    value: {
      tenantSlug,
      primaryColor: primaryColor.toLowerCase(),
      secondaryColor: secondaryColor.toLowerCase(),
    },
    fieldErrors,
  };
}

export function validateUpdateCommercialSettingsInput(
  input: UpdateCommercialSettingsInput,
): {
  value: NormalizedUpdateCommercialSettingsInput | null;
  fieldErrors: TenantCommandFieldErrors;
} {
  const fieldErrors: TenantCommandFieldErrors = {};
  const tenantSlug = normalizeRequiredText(input.tenantSlug);
  const currency = normalizeRequiredText(input.currency).toUpperCase();
  const minimumOrderAmount = parseNonNegativeAmount(
    input.minimumOrderAmount,
    'minimumOrderAmount',
    fieldErrors,
  );
  const minimumPurchaseAmount = parseNonNegativeAmount(
    input.minimumPurchaseAmount,
    'minimumPurchaseAmount',
    fieldErrors,
  );

  if (!tenantSlug) {
    fieldErrors.tenantSlug = 'El tenant es obligatorio.';
  }

  if (!currencyPattern.test(currency)) {
    fieldErrors.currency = 'La moneda debe ser un codigo ISO de 3 letras, por ejemplo ARS.';
  }

  if (
    hasFieldErrors(fieldErrors) ||
    minimumOrderAmount === null ||
    minimumPurchaseAmount === null
  ) {
    return { value: null, fieldErrors };
  }

  return {
    value: {
      tenantSlug,
      currency,
      minimumOrderAmount,
      minimumPurchaseAmount,
      defaultPriceListId: normalizeOptionalText(input.defaultPriceListId),
    },
    fieldErrors,
  };
}

export function validateUpdateFeatureFlagsInput(input: UpdateFeatureFlagsInput): {
  value: NormalizedUpdateFeatureFlagsInput | null;
  fieldErrors: TenantCommandFieldErrors;
} {
  const fieldErrors: TenantCommandFieldErrors = {};
  const tenantSlug = normalizeRequiredText(input.tenantSlug);

  if (!tenantSlug) {
    fieldErrors.tenantSlug = 'El tenant es obligatorio.';
  }

  if (hasFieldErrors(fieldErrors)) {
    return { value: null, fieldErrors };
  }

  return {
    value: {
      tenantSlug,
      features: normalizeFeatureFlags(input.features),
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

function parseNonNegativeAmount(
  value: unknown,
  field: 'minimumOrderAmount' | 'minimumPurchaseAmount',
  fieldErrors: TenantCommandFieldErrors,
) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return 0;
  }

  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const parsed = typeof normalized === 'number' ? normalized : Number.parseFloat(String(normalized));

  if (!Number.isFinite(parsed)) {
    fieldErrors[field] = 'El monto debe ser numerico.';
    return null;
  }

  if (parsed < 0) {
    fieldErrors[field] = 'El monto debe ser mayor o igual a cero.';
    return null;
  }

  return parsed;
}

function normalizeFeatureFlags(features: TenantFeatureFlags | null | undefined): TenantFeatureFlags {
  return {
    publicCatalog: features?.publicCatalog === true,
    orders: features?.orders === true,
    wholesaleLogin: features?.wholesaleLogin === true,
    multiplePriceLists: features?.multiplePriceLists === true,
    importer: features?.importer === true,
    images: features?.images === true,
    stock: features?.stock === true,
    invoicing: features?.invoicing === true,
  };
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function hasFieldErrors(fieldErrors: TenantCommandFieldErrors) {
  return Object.keys(fieldErrors).length > 0;
}
