import type { PublicProductPriceSnapshot } from '../pricing/interfaces';
import type { TenantPublicConfig } from '../tenant/interfaces';

export type ProductSortField = 'name' | 'sku' | 'createdAt' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';

export interface ProductCategoryReference {
  id: string;
  name: string;
  slug: string;
}

export interface ProductBrandReference {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description: string | null;
  line: string | null;
  variant: string | null;
  category: ProductCategoryReference;
  brand: ProductBrandReference;
  active: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListQuery {
  search?: string;
  categoryId?: string;
  brandId?: string;
  active?: boolean;
  sort?: ProductSortField;
  direction?: SortDirection;
  page?: number;
  pageSize?: number;
}

export interface ProductPage {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ProductWriteInput {
  sku: string;
  name: string;
  description: string | null;
  line: string | null;
  variant: string | null;
  categoryId: string;
  brandId: string;
  active: boolean;
  featured: boolean;
}

export interface FeaturedProductsQuery {
  categoryId?: string;
  limit?: number;
}

export type PublicProductSort =
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc'
  | 'sku_asc';

export interface ListPublicProductsInput {
  tenantSlug: string;
  search?: string;
  categoryId?: string;
  brandId?: string;
  sort?: PublicProductSort;
  page?: number;
  pageSize?: number;
}

export interface GetPublicProductBySkuInput {
  tenantSlug: string;
  sku: string;
}

export interface ListFeaturedPublicProductsInput {
  tenantSlug: string;
  limit?: number;
  categoryId?: string;
  brandId?: string;
}

export interface PublicCategorySnapshot {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

export interface PublicBrandSnapshot {
  id: string;
  name: string;
  active: boolean;
}

export interface PublicProductSnapshot {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  line: string | null;
  variant: string | null;
  categoryId: string;
  brandId: string;
  active: boolean;
  prices: PublicProductPriceSnapshot[];
}

export interface PublicCatalogSnapshot {
  categories: PublicCategorySnapshot[];
  brands: PublicBrandSnapshot[];
  products: PublicProductSnapshot[];
}

export interface PublicProductDetailSnapshot {
  product: PublicProductSnapshot | null;
  category: PublicCategorySnapshot | null;
  brand: PublicBrandSnapshot | null;
}

export interface PublicFeaturedProductCandidateSnapshot {
  product: PublicProductSnapshot;
  category: PublicCategorySnapshot | null;
  brand: PublicBrandSnapshot | null;
}

export interface PublicProductsRepository {
  loadCatalogSnapshot(
    tenantId: string,
    priceListId: string,
  ): Promise<PublicCatalogSnapshot>;
  loadProductBySkuSnapshot(
    tenantId: string,
    sku: string,
    priceListId: string,
  ): Promise<PublicProductDetailSnapshot>;
}

export interface PublicFeaturedProductsRepository {
  loadFeaturedCandidatesSnapshot(
    tenantId: string,
    priceListId: string,
    input: {
      limit: number;
      categoryId: string | null;
      brandId: string | null;
    },
  ): Promise<PublicFeaturedProductCandidateSnapshot[]>;
}

export type PublicCatalogTenant = TenantPublicConfig;

export interface PublicProductListItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  line: string | null;
  variant: string | null;
  categoryId: string;
  categoryName: string;
  brandId: string;
  brandName: string;
  price: { amount: string; currency: string } | null;
}

export interface PublicProductDetail extends Omit<PublicProductListItem, 'price'> {
  price: { amount: string; currency: string };
}

export interface PublicProductFilterOption {
  id: string;
  name: string;
}

export interface PublicProductsPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface ListPublicProductsOutput {
  tenant: PublicCatalogTenant;
  products: PublicProductListItem[];
  categories: PublicProductFilterOption[];
  brands: PublicProductFilterOption[];
  totalVisibleProducts: number;
  pagination: PublicProductsPagination;
}

export interface GetPublicProductBySkuOutput {
  tenant: PublicCatalogTenant;
  product: PublicProductDetail;
}

export interface ListFeaturedPublicProductsOutput {
  tenant: PublicCatalogTenant;
  products: PublicProductListItem[];
  strategy: string;
}
