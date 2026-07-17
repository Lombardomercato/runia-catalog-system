import type {
  CommerceTenantSetupFeatures,
  CommerceTenantSetupStatus,
  CommerceTenantPricingMode,
  CreatedCommerceTenantSetup,
} from '@/core/tenant/setup';

export type SetupPriceListDraft = {
  clientId: string;
  name: string;
  code: string;
  active: boolean;
  isDefault: boolean;
  pricingMode: CommerceTenantPricingMode;
  marginPercent: string;
};

export type SetupDraft = {
  name: string;
  slug: string;
  legalName: string;
  email: string;
  whatsapp: string;
  currency: string;
  locale: string;
  status: CommerceTenantSetupStatus;
  minimumOrderAmount: string;
  minimumPurchaseAmount: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  features: CommerceTenantSetupFeatures;
  priceLists: SetupPriceListDraft[];
};

export type SetupCommandCode =
  | 'CREATED'
  | 'INVALID_INPUT'
  | 'TENANT_ALREADY_EXISTS'
  | 'UNAUTHORIZED'
  | 'REPOSITORY_FAILURE';

export type SetupCommandResult = {
  ok: boolean;
  code: SetupCommandCode;
  message: string | null;
  error: string | null;
  fieldErrors: Record<string, string>;
  setup: CreatedCommerceTenantSetup | null;
};

export type SetupRpcPriceList = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  isDefault: boolean;
  pricingMode: CommerceTenantPricingMode;
  marginPercent: number | string;
};

export type SetupRpcResult = {
  state: 'created' | 'exists';
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  currency: string;
  locale: string;
  email: string | null;
  whatsapp: string | null;
  defaultPriceListId: string | null;
  controlledBrandId: string | null;
  features: Record<string, unknown>;
  priceLists: SetupRpcPriceList[];
};
