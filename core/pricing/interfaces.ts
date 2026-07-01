import type { PricingResult } from './errors';

export interface Money {
  amount: string;
  currency: string;
}

export type PricingMode = 'manual' | 'cost_plus_percent';

export interface PriceList {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  active: boolean;
  isDefault: boolean;
  mode: PricingMode;
  marginPercent: string;
}

export interface ResolvedPrice {
  productId: string;
  priceListId: string;
  unitPrice: Money;
  resolvedForAccountId: string | null;
  source: 'manual' | 'cost_plus_percent' | 'fallback';
  resolvedAt: string;
}

export interface ResolvePriceInput {
  productId: string;
  accountId?: string;
  priceListId?: string;
  quantity?: number;
}

export interface SetManualPriceInput {
  productId: string;
  priceListId: string;
  price: Money;
}

export interface RecalculatePricesInput {
  priceListId: string;
  brandId?: string;
  productIds?: string[];
}

export interface RecalculatePricesResult {
  affectedProducts: number;
  skippedProducts: number;
}

export interface PublicPricingTenantSnapshot {
  id: string;
  status: 'active' | 'inactive';
  currency: string;
  defaultPriceListId: string | null;
}

export interface PublicPriceListSnapshot {
  id: string;
  code: string;
  name: string;
  active: boolean;
  isDefault: boolean;
}

export interface PublicProductPriceSnapshot {
  priceListId: string;
  amount: string;
  currency: string;
  pricingMode: PricingMode;
  calculatedFromCost: boolean;
}

export interface ResolvePublicPriceListInput {
  tenant: PublicPricingTenantSnapshot;
  priceLists: PublicPriceListSnapshot[];
}

export interface ResolvedPublicPriceList {
  id: string;
  code: string;
  name: string;
}

export interface ResolvePublicPriceInput extends ResolvePublicPriceListInput {
  productId: string;
  prices: PublicProductPriceSnapshot[];
}

export interface ResolvedPublicPrice {
  productId: string;
  priceList: ResolvedPublicPriceList;
  unitPrice: Money;
  source: 'manual' | 'calculated';
}

export interface PublicPriceResolver {
  resolvePriceList(
    input: ResolvePublicPriceListInput,
  ): PricingResult<ResolvedPublicPriceList>;
  execute(input: ResolvePublicPriceInput): PricingResult<ResolvedPublicPrice>;
}
