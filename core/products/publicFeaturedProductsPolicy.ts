import type { PublicProductListItem } from './interfaces';

export interface PublicFeaturedProductsPolicy {
  readonly key: string;
  select(products: PublicProductListItem[], limit: number): PublicProductListItem[];
}

export const stablePublicFeaturedProductsPolicy: PublicFeaturedProductsPolicy = {
  key: 'stable_name_sku_id_v1',
  select(products, limit) {
    return [...products]
      .sort((left, right) => (
        compareText(left.name, right.name) ||
        compareText(left.sku, right.sku) ||
        left.id.localeCompare(right.id)
      ))
      .slice(0, limit);
  },
};

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'es', { sensitivity: 'base', numeric: true });
}
