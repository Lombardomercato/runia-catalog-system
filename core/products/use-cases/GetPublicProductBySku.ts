import type { ProductsResult } from '../errors';
import type { PublicPriceResolver } from '../../pricing/interfaces';
import type { PublicTenantConfigResolver } from '../../tenant/interfaces';
import type {
  GetPublicProductBySkuInput,
  GetPublicProductBySkuOutput,
  PublicProductsRepository,
} from '../interfaces';
import {
  mapPublicPricingFailure,
  mapPublicTenantFailure,
  productsFailure,
  projectPublicProduct,
  resolvePublicCatalogContext,
  toPublicPricingTenant,
} from '../publicCatalogPolicy';

export class GetPublicProductBySku {
  constructor(
    private readonly repository: PublicProductsRepository,
    private readonly pricing: PublicPriceResolver,
    private readonly tenantConfig: PublicTenantConfigResolver,
  ) {}

  async execute(
    input: GetPublicProductBySkuInput,
  ): Promise<ProductsResult<GetPublicProductBySkuOutput>> {
    const tenantSlug = input.tenantSlug.trim();
    const sku = input.sku.trim();
    if (!tenantSlug || !sku || sku.length > 200) {
      return productsFailure('INVALID_INPUT', 'The tenant slug and SKU are required.');
    }

    const tenantResult = await this.tenantConfig.execute({ slug: tenantSlug });
    if (!tenantResult.ok) return mapPublicTenantFailure(tenantResult.error);
    const context = resolvePublicCatalogContext(tenantResult.value);
    if (!context.ok) return context;

    let snapshot;
    try {
      snapshot = await this.repository.loadProductBySkuSnapshot(tenantResult.value.id, sku);
    } catch {
      return productsFailure('REPOSITORY_FAILURE', 'The public product could not be loaded.');
    }

    const { product, category, brand } = snapshot;
    if (
      !product ||
      !product.active ||
      !category ||
      !category.active ||
      !brand ||
      !brand.active
    ) {
      return productsFailure('PRODUCT_NOT_FOUND', 'The public product was not found.');
    }

    const resolvedPrice = this.pricing.execute({
      tenant: toPublicPricingTenant(tenantResult.value),
      priceLists: snapshot.priceLists,
      productId: product.id,
      prices: product.prices,
    });
    if (!resolvedPrice.ok) return mapPublicPricingFailure(resolvedPrice.error);

    const projected = projectPublicProduct(
      product,
      category,
      brand,
      resolvedPrice.value,
    );

    return {
      ok: true,
      value: {
        tenant: context.value.tenant,
        product: projected,
      },
    };
  }
}
