export type CommerceTenantSetupStatus = 'active' | 'setup';
export type CommerceTenantPricingMode = 'manual' | 'cost_plus_percent';

export type CommerceTenantSetupFeatures = {
  showPrices: boolean;
  publicCatalog: boolean;
  orders: boolean;
  importer: boolean;
  multiplePriceLists: boolean;
  images: boolean;
  wholesaleLogin: boolean;
};

export type CommerceTenantPriceListInput = {
  name: string;
  code: string;
  active?: boolean;
  isDefault?: boolean;
  pricingMode?: CommerceTenantPricingMode;
  marginPercent?: number | string | null;
};

export type CommerceTenantSetupInput = {
  name: string;
  slug: string;
  legalName?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  currency?: string;
  locale?: string;
  status?: CommerceTenantSetupStatus;
  minimumOrderAmount?: number | string | null;
  minimumPurchaseAmount?: number | string | null;
  logoUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  features?: Partial<CommerceTenantSetupFeatures>;
  priceLists?: CommerceTenantPriceListInput[];
};

export type PreparedCommerceTenantPriceList = {
  name: string;
  code: string;
  active: boolean;
  isDefault: boolean;
  pricingMode: CommerceTenantPricingMode;
  marginPercent: number;
};

export type PreparedCommerceTenantSetup = {
  name: string;
  slug: string;
  legalName: string | null;
  email: string | null;
  whatsapp: string | null;
  currency: string;
  locale: string;
  status: CommerceTenantSetupStatus;
  minimumOrderAmount: number;
  minimumPurchaseAmount: number;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  features: CommerceTenantSetupFeatures;
  priceLists: PreparedCommerceTenantPriceList[];
};

export type CreatedCommerceTenantPriceList = PreparedCommerceTenantPriceList & {
  id: string;
};

export type CreatedCommerceTenantSetup = {
  tenantId: string;
  name: string;
  slug: string;
  status: CommerceTenantSetupStatus;
  currency: string;
  locale: string;
  email: string | null;
  whatsapp: string | null;
  features: CommerceTenantSetupFeatures;
  priceLists: CreatedCommerceTenantPriceList[];
  defaultPriceListId: string;
  controlledBrandId: string;
};

export type CommerceTenantSetupRepositoryResult =
  | { state: 'created'; value: CreatedCommerceTenantSetup }
  | { state: 'exists'; value: CreatedCommerceTenantSetup };

export interface CommerceTenantSetupRepository {
  createAtomically(
    input: PreparedCommerceTenantSetup,
  ): Promise<CommerceTenantSetupRepositoryResult>;
}

export type TenantSetupErrorCode =
  | 'INVALID_INPUT'
  | 'TENANT_ALREADY_EXISTS'
  | 'REPOSITORY_FAILURE';

export type TenantSetupDomainError = {
  domain: 'tenant-setup';
  code: TenantSetupErrorCode;
  message: string;
  fieldErrors: Record<string, string>;
};

export type TenantSetupResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: TenantSetupDomainError };

export const DEFAULT_COMMERCE_TENANT_SETUP_FEATURES: CommerceTenantSetupFeatures = {
  showPrices: true,
  publicCatalog: true,
  orders: true,
  importer: true,
  multiplePriceLists: true,
  images: false,
  wholesaleLogin: false,
};

export const DEFAULT_COMMERCE_TENANT_PRICE_LISTS: PreparedCommerceTenantPriceList[] = [
  {
    name: 'Minorista',
    code: 'minorista',
    active: true,
    isDefault: true,
    pricingMode: 'manual',
    marginPercent: 0,
  },
  {
    name: 'Mayorista',
    code: 'mayorista',
    active: true,
    isDefault: false,
    pricingMode: 'manual',
    marginPercent: 0,
  },
];

export function tenantSetupFailure(
  code: TenantSetupErrorCode,
  message: string,
  fieldErrors: Record<string, string> = {},
): TenantSetupResult<never> {
  return {
    ok: false,
    error: { domain: 'tenant-setup', code, message, fieldErrors },
  };
}
