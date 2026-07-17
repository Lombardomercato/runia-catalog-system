import type { PublicPriceResolver } from '../../pricing/interfaces';
import type { PublicTenantConfigResolver } from '../../tenant/interfaces';
import type { ProductsResult } from '../errors';
import type {
  ListFeaturedPublicProductsInput,
  ListFeaturedPublicProductsOutput,
  PublicFeaturedProductsRepository,
  PublicProductListItem,
} from '../interfaces';
import {
  isPublicPriceUnavailable,
  mapPublicPricingFailure,
  mapPublicTenantFailure,
  productsFailure,
  projectPublicProduct,
  resolvePublicCatalogContext,
  toPublicPricingTenant,
  toResolvedPublicPriceLists,
} from '../publicCatalogPolicy';
import {
  stablePublicFeaturedProductsPolicy,
  type PublicFeaturedProductsPolicy,
} from '../publicFeaturedProductsPolicy';

export const DEFAULT_PUBLIC_FEATURED_LIMIT = 3;
export const MAX_PUBLIC_FEATURED_LIMIT = 12;

export class ListFeaturedPublicProducts {
  constructor(
    private readonly repository: PublicFeaturedProductsRepository,
    private readonly pricing: PublicPriceResolver,
    private readonly tenantConfig: PublicTenantConfigResolver,
    private readonly policy: PublicFeaturedProductsPolicy = stablePublicFeaturedProductsPolicy,
  ) {}

  async execute(
    input: ListFeaturedPublicProductsInput,
  ): Promise<ProductsResult<ListFeaturedPublicProductsOutput>> {
    const normalized = normalizeInput(input);
    if (!normalized) {
      return productsFailure('INVALID_INPUT', 'The featured product query is invalid.');
    }

    const tenantResult = await this.tenantConfig.execute({ slug: normalized.tenantSlug });
    if (!tenantResult.ok) return mapPublicTenantFailure(tenantResult.error);
    const catalogContext = resolvePublicCatalogContext(tenantResult.value);
    if (!catalogContext.ok) return catalogContext;

    let candidates;
    try {
      candidates = await this.repository.loadFeaturedCandidatesSnapshot(
        tenantResult.value.id,
        tenantResult.value.priceList.id,
        {
          limit: normalized.limit,
          categoryId: normalized.categoryId,
          brandId: normalized.brandId,
        },
      );
    } catch {
      return productsFailure(
        'REPOSITORY_FAILURE',
        'The featured public products could not be loaded.',
      );
    }

    const visibleProducts: PublicProductListItem[] = [];
    for (const { product, category, brand } of candidates) {
      if (
        !product.active ||
        !category?.active ||
        !brand?.active ||
        (normalized.categoryId && product.categoryId !== normalized.categoryId) ||
        (normalized.brandId && product.brandId !== normalized.brandId)
      ) {
        continue;
      }

      const resolvedPrice = this.pricing.execute({
        tenant: toPublicPricingTenant(tenantResult.value),
        priceLists: toResolvedPublicPriceLists(tenantResult.value),
        productId: product.id,
        prices: product.prices,
      });
      if (!resolvedPrice.ok) {
        if (isPublicPriceUnavailable(resolvedPrice.error)) continue;
        return mapPublicPricingFailure(resolvedPrice.error);
      }
      visibleProducts.push(projectPublicProduct(product, category, brand, resolvedPrice.value));
    }

    return {
      ok: true,
      value: {
        tenant: catalogContext.value.tenant,
        products: this.policy.select(visibleProducts, normalized.limit),
        strategy: this.policy.key,
      },
    };
  }
}

function normalizeInput(input: ListFeaturedPublicProductsInput) {
  const tenantSlug = input.tenantSlug.trim();
  const requestedLimit = input.limit ?? DEFAULT_PUBLIC_FEATURED_LIMIT;
  if (
    !tenantSlug ||
    !Number.isInteger(requestedLimit) ||
    requestedLimit <= 0 ||
    (input.categoryId !== undefined && typeof input.categoryId !== 'string') ||
    (input.brandId !== undefined && typeof input.brandId !== 'string')
  ) {
    return null;
  }
  const categoryId = input.categoryId?.trim() || null;
  const brandId = input.brandId?.trim() || null;
  if ((categoryId?.length ?? 0) > 200 || (brandId?.length ?? 0) > 200) return null;
  return {
    tenantSlug,
    limit: Math.min(requestedLimit, MAX_PUBLIC_FEATURED_LIMIT),
    categoryId,
    brandId,
  };
}
