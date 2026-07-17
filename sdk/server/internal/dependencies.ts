import type {
  PublicBrandSnapshot,
  PublicCategorySnapshot,
  PublicFeaturedProductsRepository,
  PublicProductsRepository,
} from '@/core/products/interfaces';
import type {
  PublicPriceResolver,
  PublicProductPriceSnapshot,
} from '@/core/pricing/interfaces';
import type { PublicTenantRepository } from '@/core/tenant/interfaces';

export type PublicPriceContext = {
  productId: string;
  productActive: boolean;
  categoryActive: boolean;
  brandActive: boolean;
  prices: PublicProductPriceSnapshot[];
};

export interface CommerceDataRepository
  extends PublicProductsRepository, PublicFeaturedProductsRepository {
  listPublicCategories(tenantId: string): Promise<PublicCategorySnapshot[]>;
  listPublicBrands(tenantId: string): Promise<PublicBrandSnapshot[]>;
  loadPublicPriceContext(
    tenantId: string,
    productId: string,
    priceListId: string,
  ): Promise<PublicPriceContext | null>;
}

export type CommerceClientDependencies = {
  tenantRepository: PublicTenantRepository;
  dataRepository: CommerceDataRepository;
  priceResolver: PublicPriceResolver;
};
