import type {
  CommerceTenantSetupRepositoryResult,
  CreatedCommerceTenantSetup,
  PreparedCommerceTenantSetup,
} from '@/core/tenant/setup';
import type { SetupRpcResult } from './types';

export function mapSetupToRpcInput(input: PreparedCommerceTenantSetup) {
  return {
    ...input,
    priceLists: input.priceLists.map((priceList) => ({ ...priceList })),
    features: { ...input.features },
  };
}

export function mapSetupRpcResult(value: unknown): CommerceTenantSetupRepositoryResult | null {
  if (!isSetupRpcResult(value)) return null;
  const mapped: CreatedCommerceTenantSetup = {
    tenantId: value.tenantId,
    name: value.name,
    slug: value.slug,
    status: value.status === 'active' ? 'active' : 'setup',
    currency: value.currency,
    locale: value.locale,
    email: nullableString(value.email),
    whatsapp: nullableString(value.whatsapp),
    defaultPriceListId: value.defaultPriceListId ?? '',
    controlledBrandId: value.controlledBrandId ?? '',
    features: {
      showPrices: value.features.showPrices === true,
      publicCatalog: value.features.publicCatalog === true,
      orders: value.features.orders === true,
      importer: value.features.importer === true,
      multiplePriceLists: value.features.multiplePriceLists === true,
      images: value.features.images === true,
      wholesaleLogin: value.features.wholesaleLogin === true,
    },
    priceLists: value.priceLists.map((priceList) => ({
      id: priceList.id,
      name: priceList.name,
      code: priceList.code,
      active: priceList.active,
      isDefault: priceList.isDefault,
      pricingMode: priceList.pricingMode,
      marginPercent: Number(priceList.marginPercent),
    })),
  };
  if (
    value.state === 'created' &&
    (!mapped.tenantId || !mapped.defaultPriceListId || !mapped.controlledBrandId)
  ) {
    return null;
  }
  return { state: value.state, value: mapped };
}

function isSetupRpcResult(value: unknown): value is SetupRpcResult {
  if (!isRecord(value)) return false;
  if (value.state !== 'created' && value.state !== 'exists') return false;
  if (
    !nonEmptyString(value.tenantId) ||
    !nonEmptyString(value.name) ||
    !nonEmptyString(value.slug) ||
    !nonEmptyString(value.status) ||
    !nonEmptyString(value.currency) ||
    !nonEmptyString(value.locale) ||
    !isRecord(value.features) ||
    !Array.isArray(value.priceLists)
  ) {
    return false;
  }
  return value.priceLists.every((priceList) =>
    isRecord(priceList) &&
    nonEmptyString(priceList.id) &&
    nonEmptyString(priceList.name) &&
    nonEmptyString(priceList.code) &&
    typeof priceList.active === 'boolean' &&
    typeof priceList.isDefault === 'boolean' &&
    (priceList.pricingMode === 'manual' || priceList.pricingMode === 'cost_plus_percent') &&
    Number.isFinite(Number(priceList.marginPercent)),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}
