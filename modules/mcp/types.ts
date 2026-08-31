export type PricingPolicy =
  | 'RETAIL'
  | 'WHOLESALE'
  | 'BUSINESS'
  | 'CUSTOM_DISCOUNT';

export type PricingContext = {
  policy: PricingPolicy;
  discountPercent: number;
};

export type SalesProduct = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  categorySlug: string;
  presentation: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  basePrice: number;
  currency: 'ARS';
  pricingPolicy: PricingPolicy;
  discountPercent: number;
  availability: 'SUPPLIER_AVAILABLE';
  opportunity: {
    referencePrice: number;
    startAt: string;
    reviewAt: string;
  } | null;
};

export type GuideMatch = {
  slug: string;
  title: string;
  description: string;
  href: string;
  matchedOn: string[];
};

export interface SalesCatalog {
  searchProducts(input: {
    query?: string;
    categorySlug?: string;
    maxPrice?: number;
    limit: number;
    pricing: PricingContext;
    opportunitiesOnly?: boolean;
  }): Promise<SalesProduct[]>;
  getProduct(input: {
    productId?: string;
    sku?: string;
    pricing: PricingContext;
  }): Promise<SalesProduct | null>;
  searchGuides(input: { query: string; limit: number }): Promise<GuideMatch[]>;
}
