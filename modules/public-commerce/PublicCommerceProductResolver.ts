import type {
  DraftOrderProductResolution,
  DraftOrderProductResolver,
} from '@/core/orders/interfaces';
import type { PublicCommerceProduct } from './types';

export class PublicCommerceProductResolver implements DraftOrderProductResolver {
  private readonly products = new Map<string, { tenantId: string; product: PublicCommerceProduct }>();

  register(tenantId: string, product: PublicCommerceProduct) {
    this.products.set(product.id, { tenantId, product });
  }

  async resolvePublicProduct(
    tenantId: string,
    productId: string,
  ): Promise<DraftOrderProductResolution> {
    const registered = this.products.get(productId);
    if (!registered || registered.tenantId !== tenantId) {
      return { status: 'product_not_found', productId };
    }
    if (registered.product.price === null || registered.product.price < 0) {
      return { status: 'price_unavailable', productId };
    }
    return {
      status: 'available',
      product: {
        productSnapshot: {
          productId: registered.product.id,
          sku: registered.product.sku,
          name: registered.product.name,
          variant: registered.product.variant,
          line: registered.product.productLine,
          brandName: registered.product.brandName,
          categoryName: registered.product.categoryName,
        },
        publicPrice: {
          amount: String(registered.product.price),
          currency: registered.product.currency,
        },
      },
    };
  }
}
