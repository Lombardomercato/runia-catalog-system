import type { CommerceProduct } from '@/sdk/server/types';
import type { PublicCommerceProduct } from './types';

export function mapCommerceProductToPublicCommerceProduct(
  product: CommerceProduct,
): PublicCommerceProduct {
  const amount = Number(product.price.amount);
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    variant: product.variant,
    productLine: product.productLine,
    brandName: product.brand.name,
    categoryName: product.category.name,
    price: Number.isFinite(amount) ? amount : null,
    currency: product.price.currency,
  };
}
