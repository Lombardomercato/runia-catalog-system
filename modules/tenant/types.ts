export type TenantPriceListOption = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
};

export type TenantIdentity = {
  id: string;
  slug: string;
  name: string;
  currency: string;
};

export type TenantIdentityResult = {
  tenant: TenantIdentity | null;
  error: string | null;
};

export type TenantCompanySettings = {
  commercialName: string;
  legalName: string | null;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  website: string | null;
};

export type TenantBrandingSettings = {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
};

export type TenantCommercialSettings = {
  currency: string;
  minimumOrderAmount: number;
  minimumPurchaseAmount: number;
  defaultPriceListId: string | null;
};

export type TenantFeatureFlags = {
  publicCatalog: boolean;
  orders: boolean;
  wholesaleLogin: boolean;
  multiplePriceLists: boolean;
  importer: boolean;
  images: boolean;
  stock: boolean;
  invoicing: boolean;
};

export type TenantSettings = {
  id: string;
  slug: string;
  status: string;
  updatedAt: string;
  company: TenantCompanySettings;
  branding: TenantBrandingSettings;
  commercial: TenantCommercialSettings;
  features: TenantFeatureFlags;
  priceLists: TenantPriceListOption[];
};

export type TenantSettingsResult = {
  tenant: TenantSettings | null;
  error: string | null;
};

export type TenantCommandFieldErrors = Partial<
  Record<
    | 'commercialName'
    | 'tenantSlug'
    | 'legalName'
    | 'email'
    | 'whatsapp'
    | 'address'
    | 'website'
    | 'primaryColor'
    | 'secondaryColor'
    | 'currency'
    | 'minimumOrderAmount'
    | 'minimumPurchaseAmount'
    | 'defaultPriceListId',
    string
  >
>;

export type TenantCommandResult = {
  ok: boolean;
  affected: number;
  message: string | null;
  error: string | null;
  fieldErrors: TenantCommandFieldErrors;
  updatedAt?: string;
};

export type UpdateTenantInput = {
  tenantSlug: string;
  commercialName: string;
  legalName: string | null;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  website: string | null;
};

export type NormalizedUpdateTenantInput = UpdateTenantInput;

export type UpdateBrandingInput = {
  tenantSlug: string;
  primaryColor: string;
  secondaryColor: string;
};

export type NormalizedUpdateBrandingInput = UpdateBrandingInput;

export type UpdateCommercialSettingsInput = {
  tenantSlug: string;
  currency: string;
  minimumOrderAmount: number | string | null;
  minimumPurchaseAmount: number | string | null;
  defaultPriceListId: string | null;
};

export type NormalizedUpdateCommercialSettingsInput = {
  tenantSlug: string;
  currency: string;
  minimumOrderAmount: number;
  minimumPurchaseAmount: number;
  defaultPriceListId: string | null;
};

export type UpdateFeatureFlagsInput = {
  tenantSlug: string;
  features: TenantFeatureFlags;
};

export type NormalizedUpdateFeatureFlagsInput = UpdateFeatureFlagsInput;

export type TenantRow = {
  id: string;
  slug: string;
  status: string;
  name: string;
  legal_name: string | null;
  contact_email: string | null;
  whatsapp_phone: string | null;
  address: string | null;
  website_url: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  currency: string | null;
  minimum_order_amount: number | string | null;
  minimum_purchase_amount: number | string | null;
  default_price_list_id: string | null;
  feature_public_catalog: boolean | null;
  feature_orders: boolean | null;
  feature_wholesale_login: boolean | null;
  feature_multiple_price_lists: boolean | null;
  feature_importer: boolean | null;
  feature_images: boolean | null;
  feature_stock: boolean | null;
  feature_invoicing: boolean | null;
  updated_at: string;
};
