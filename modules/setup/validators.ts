import type { CommerceTenantSetupInput } from '@/core/tenant/setup';
import { normalizeTenantSetupSlug } from '@/core/tenant/use-cases/PrepareTenantDefaults';
import type { SetupDraft } from './types';

export function validateSetupTransport(input: unknown): CommerceTenantSetupInput | null {
  if (!isRecord(input) || !Array.isArray(input.priceLists) || input.priceLists.length > 10) {
    return null;
  }
  if (!isRecord(input.features)) return null;

  const priceLists = input.priceLists.map((priceList) => {
    if (!isRecord(priceList)) return null;
    return {
      name: stringValue(priceList.name),
      code: stringValue(priceList.code),
      active: priceList.active === true,
      isDefault: priceList.isDefault === true,
      pricingMode: priceList.pricingMode === 'cost_plus_percent'
        ? 'cost_plus_percent' as const
        : 'manual' as const,
      marginPercent: numberLikeValue(priceList.marginPercent),
    };
  });
  if (priceLists.some((priceList) => priceList === null)) return null;

  return {
    name: stringValue(input.name),
    slug: stringValue(input.slug),
    legalName: stringValue(input.legalName),
    email: stringValue(input.email),
    whatsapp: stringValue(input.whatsapp),
    currency: stringValue(input.currency),
    locale: stringValue(input.locale),
    status: input.status === 'setup' ? 'setup' : 'active',
    minimumOrderAmount: numberLikeValue(input.minimumOrderAmount),
    minimumPurchaseAmount: numberLikeValue(input.minimumPurchaseAmount),
    logoUrl: stringValue(input.logoUrl),
    primaryColor: stringValue(input.primaryColor),
    secondaryColor: stringValue(input.secondaryColor),
    features: {
      showPrices: input.features.showPrices === true,
      publicCatalog: input.features.publicCatalog === true,
      orders: input.features.orders === true,
      importer: input.features.importer === true,
      multiplePriceLists: input.features.multiplePriceLists === true,
      images: input.features.images === true,
      wholesaleLogin: input.features.wholesaleLogin === true,
    },
    priceLists: priceLists.filter((priceList) => priceList !== null),
  };
}

export function suggestSetupSlug(value: string) {
  return normalizeTenantSetupSlug(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.slice(0, 4096) : '';
}

function numberLikeValue(value: unknown): string | number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 100);
  return null;
}

export function hasSetupFieldError(
  result: { fieldErrors: Record<string, string> } | null,
  field: keyof SetupDraft | string,
) {
  return result?.fieldErrors[field] ?? null;
}
