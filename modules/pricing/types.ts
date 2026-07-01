export type PricingListCode = 'minorista' | 'mayorista';
export type PricingMode = 'manual' | 'cost_plus_percent';

export type PricingCoverageFilter =
  | 'all'
  | 'missing_minorista'
  | 'missing_mayorista';

export type PricingListParams = {
  search: string;
  brandId: string;
  categoryId: string;
  coverage: PricingCoverageFilter;
  page: number;
  pageSize: number;
};

export type PricingFilterOption = {
  id: string;
  name: string;
};

export type PricingPriceList = {
  id: string;
  code: PricingListCode;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  pricingMode: PricingMode;
  marginPercent: number;
};

export type PricingProduct = {
  id: string;
  sku: string;
  name: string;
  variant: string | null;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  isActive: boolean;
  cost: number;
  costCurrency: string;
  minoristaPrice: number | null;
  mayoristaPrice: number | null;
  minoristaPricingMode: PricingMode;
  mayoristaPricingMode: PricingMode;
  minoristaMarginOverride: number | null;
  mayoristaMarginOverride: number | null;
  minoristaCalculatedFromCost: boolean;
  mayoristaCalculatedFromCost: boolean;
};

export type PricingPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type PricingSummary = {
  products: number;
  missingCost: number;
  missingMinorista: number;
  missingMayorista: number;
};

export type PricingListResult = {
  products: PricingProduct[];
  brands: PricingFilterOption[];
  categories: PricingFilterOption[];
  priceLists: PricingPriceList[];
  currency: string;
  summary: PricingSummary;
  pagination: PricingPagination;
  error: string | null;
};

export type PricingRelation<T> = T | T[] | null;

export type PricingProductQueryRow = {
  id: string;
  sku: string;
  name: string;
  variant: string | null;
  is_active: boolean;
  cost: number | string | null;
  cost_currency: string | null;
  brands: PricingRelation<{ id: string; name: string | null }>;
  categories: PricingRelation<{ id: string; name: string | null }>;
  product_prices: Array<{
    price_list_id: string;
    price: number | string | null;
    pricing_mode: string | null;
    margin_percent_override: number | string | null;
    calculated_from_cost: boolean | null;
  }> | null;
};

export type PricingRowInput = {
  productId: string;
  cost: number | string | null;
  costCurrency: string;
  minoristaPrice: number | string | null;
  mayoristaPrice: number | string | null;
  minoristaPricingMode: PricingMode;
  mayoristaPricingMode: PricingMode;
  minoristaMarginOverride: number | string | null;
  mayoristaMarginOverride: number | string | null;
};

export type UpdateProductPricesInput = PricingRowInput & {
  tenantSlug: string;
};

export type UpdateSingleProductPriceInput = {
  tenantSlug: string;
  productId: string;
  priceListCode: PricingListCode;
  price: number | string | null;
};

export type NormalizedSingleProductPrice = {
  tenantSlug: string;
  productId: string;
  priceListCode: PricingListCode;
  price: number;
};

export type UpdatePricingBlockInput = {
  tenantSlug: string;
  rows: PricingRowInput[];
};

export type CopyRetailToWholesaleInput = {
  tenantSlug: string;
  productIds: string[];
  adjustmentPercent: number | string;
};

export type PricingBrandOperation = 'increase' | 'decrease' | 'copy_retail_to_wholesale';

export type ApplyBrandPricingInput = {
  tenantSlug: string;
  brandId: string;
  operation: PricingBrandOperation;
  percentage: number | string;
};

export type UpdatePriceListRuleInput = {
  tenantSlug: string;
  priceListCode: PricingListCode;
  pricingMode: PricingMode;
  marginPercent: number | string;
};

export type RecalculatePriceListInput = {
  tenantSlug: string;
  priceListCode: PricingListCode;
};

export type RecalculateBrandPricesInput = RecalculatePriceListInput & {
  brandId: string;
};

export type ApplyCostPlusInput = RecalculatePriceListInput & {
  productIds: string[];
};

export type NormalizedPricingRow = {
  productId: string;
  cost: number;
  costCurrency: string;
  minoristaPrice: number | null;
  mayoristaPrice: number | null;
  minoristaPricingMode: PricingMode;
  mayoristaPricingMode: PricingMode;
  minoristaMarginOverride: number | null;
  mayoristaMarginOverride: number | null;
};

export type NormalizedPricingBlock = {
  tenantSlug: string;
  rows: NormalizedPricingRow[];
};

export type NormalizedCopyRetailToWholesale = {
  tenantSlug: string;
  productIds: string[];
  adjustmentPercent: number;
};

export type NormalizedApplyBrandPricing = {
  tenantSlug: string;
  brandId: string;
  operation: PricingBrandOperation;
  percentage: number;
};

export type NormalizedPriceListRule = {
  tenantSlug: string;
  priceListCode: PricingListCode;
  pricingMode: PricingMode;
  marginPercent: number;
};

export type NormalizedRecalculatePriceList = {
  tenantSlug: string;
  priceListCode: PricingListCode;
};

export type NormalizedRecalculateBrandPrices = NormalizedRecalculatePriceList & {
  brandId: string;
};

export type NormalizedApplyCostPlus = NormalizedRecalculatePriceList & {
  productIds: string[];
};

export type PricingFieldErrors = Record<string, string>;

export type PricingCommandResult = {
  ok: boolean;
  affected: number;
  message: string | null;
  error: string | null;
  warning: string | null;
  fieldErrors: PricingFieldErrors;
};
