import type { CatalogProduct, CatalogTenant } from '@/modules/catalog/types';
import type { PublicCommerceProduct, PublicCommerceTenant } from './types';

export function mapCatalogProductToPublicCommerceProduct(
  product: CatalogProduct,
): PublicCommerceProduct {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    variant: product.variant,
    productLine: product.productLine,
    brandName: product.brandName,
    categoryName: product.categoryName,
    price: product.price,
    currency: product.currency,
  };
}

export function mapCatalogTenantToPublicCommerceTenant(
  tenant: CatalogTenant,
): PublicCommerceTenant {
  return {
    id: tenant.id,
    slug: tenant.slug,
    commercialName: tenant.commercialName,
    currency: tenant.currency,
    locale: tenant.locale,
    enabled: tenant.features.orders,
    priceList: tenant.priceList
      ? {
          id: tenant.priceList.id,
          code: tenant.priceList.code,
          name: tenant.priceList.name,
        }
      : null,
  };
}
