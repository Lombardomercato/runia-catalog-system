import type { CommerceSdkError, CommerceSdkErrorCode } from './errors';

export type CommerceProductSort =
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc'
  | 'sku_asc';

export type CommerceClientConfig = {
  tenantSlug: string;
};

export type CommerceMoney = {
  amount: string;
  currency: string;
};

export type CommerceCategory = {
  id: string;
  name: string;
};

export type CommerceBrand = {
  id: string;
  name: string;
};

export type CommerceProduct = {
  id: string;
  sku: string;
  name: string;
  productLine: string | null;
  variant: string | null;
  category: CommerceCategory;
  brand: CommerceBrand;
  price: CommerceMoney;
};

export type CommerceProductDetail = CommerceProduct & {
  description: string | null;
};

export type CommercePagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type CommerceProductsListInput = {
  search?: string;
  category?: string;
  brand?: string;
  sort?: CommerceProductSort;
  page?: number;
  pageSize?: number;
};

export type CommerceFeaturedProductsInput = {
  limit?: number;
  category?: string;
  brand?: string;
};

export type CommerceProductsList = {
  products: CommerceProduct[];
  categories: CommerceCategory[];
  brands: CommerceBrand[];
  pagination: CommercePagination;
  totalProducts: number;
};

export type CommercePublicFeatureFlags = {
  showPrices: boolean;
  publicCatalog: boolean;
  orders: boolean;
  accountLogin: boolean;
  multiplePriceLists: boolean;
  images: boolean;
  stock: boolean;
};

export type CommerceTenantPublicConfig = {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  whatsapp: string | null;
  email: string | null;
  currency: string;
  locale: string;
  features: CommercePublicFeatureFlags;
};

export type CommerceWhatsAppUrlInput = {
  message: string;
};

export type CommerceWhatsAppUrlResult =
  | { available: true; url: string; code: null }
  | { available: false; url: null; code: 'WHATSAPP_NOT_CONFIGURED' };

export type CommercePricingResolveInput = {
  productId: string;
};

export type CommerceResolvedPrice = CommerceMoney & {
  productId: string;
  source: 'manual' | 'calculated';
};

export type CommerceClient = {
  tenant: {
    getPublicConfig(): Promise<CommerceTenantPublicConfig>;
    buildWhatsAppUrl(input: CommerceWhatsAppUrlInput): Promise<CommerceWhatsAppUrlResult>;
  };
  products: {
    list(input?: CommerceProductsListInput): Promise<CommerceProductsList>;
    featured(input?: CommerceFeaturedProductsInput): Promise<CommerceProduct[]>;
    getBySku(sku: string): Promise<CommerceProductDetail>;
  };
  categories: {
    list(): Promise<CommerceCategory[]>;
  };
  brands: {
    list(): Promise<CommerceBrand[]>;
  };
  pricing: {
    resolve(input: CommercePricingResolveInput): Promise<CommerceResolvedPrice>;
  };
  errors: {
    isSdkError(error: unknown): error is CommerceSdkError;
    hasCode(error: unknown, ...codes: CommerceSdkErrorCode[]): error is CommerceSdkError;
    isNotFound(error: unknown): error is CommerceSdkError;
  };
};
