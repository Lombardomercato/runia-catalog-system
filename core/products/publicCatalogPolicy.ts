import type { ProductsDomainError, ProductsResult } from './errors';
import type { PricingDomainError } from '../pricing/errors';
import type {
  PublicPriceListSnapshot,
  PublicPricingTenantSnapshot,
  ResolvedPublicPrice,
} from '../pricing/interfaces';
import type { TenantDomainError } from '../tenant/errors';
import type { TenantPublicConfig } from '../tenant/interfaces';
import type {
  PublicBrandSnapshot,
  PublicCatalogTenant,
  PublicCategorySnapshot,
  PublicProductDetail,
  PublicProductSnapshot,
} from './interfaces';

export interface PublicCatalogContext {
  tenant: PublicCatalogTenant;
}

export function resolvePublicCatalogContext(
  tenant: TenantPublicConfig,
): ProductsResult<PublicCatalogContext> {
  if (!tenant.features.publicCatalog) {
    return productsFailure('PUBLIC_CATALOG_DISABLED', 'The public catalog is disabled.');
  }

  return {
    ok: true,
    value: { tenant },
  };
}

export function toPublicPricingTenant(
  tenant: TenantPublicConfig,
): PublicPricingTenantSnapshot {
  return {
    id: tenant.id,
    status: 'active',
    currency: tenant.currency,
    defaultPriceListId: tenant.defaultPriceListId,
  };
}

export function toResolvedPublicPriceLists(
  tenant: TenantPublicConfig,
): PublicPriceListSnapshot[] {
  return [{
    ...tenant.priceList,
    active: true,
    isDefault: true,
  }];
}

export function projectPublicProduct(
  product: PublicProductSnapshot,
  category: PublicCategorySnapshot,
  brand: PublicBrandSnapshot,
  resolvedPrice: ResolvedPublicPrice,
): PublicProductDetail {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    line: product.line,
    variant: product.variant,
    categoryId: category.id,
    categoryName: category.name,
    brandId: brand.id,
    brandName: brand.name,
    price: resolvedPrice.unitPrice,
  };
}

export function mapPublicPricingFailure(
  error: PricingDomainError,
): ProductsResult<never> {
  if (error.code === 'TENANT_INACTIVE') {
    return productsFailure('TENANT_INACTIVE', error.message);
  }
  if (error.code === 'PUBLIC_PRICE_LIST_NOT_FOUND') {
    return productsFailure('PUBLIC_PRICE_LIST_NOT_FOUND', error.message);
  }
  if (error.code === 'PUBLIC_PRICE_NOT_FOUND' || error.code === 'CURRENCY_UNAVAILABLE') {
    return productsFailure(error.code, error.message);
  }
  if (error.code === 'INVALID_INPUT') {
    return productsFailure('INVALID_INPUT', error.message);
  }
  return productsFailure('REPOSITORY_FAILURE', error.message);
}

export function mapPublicTenantFailure(error: TenantDomainError): ProductsResult<never> {
  if (error.code === 'TENANT_NOT_FOUND') {
    return productsFailure('TENANT_NOT_FOUND', error.message);
  }
  if (error.code === 'TENANT_INACTIVE') {
    return productsFailure('TENANT_INACTIVE', error.message);
  }
  if (error.code === 'PUBLIC_PRICE_LIST_NOT_FOUND') {
    return productsFailure('PUBLIC_PRICE_LIST_NOT_FOUND', error.message);
  }
  if (error.code === 'INVALID_INPUT' || error.code === 'PUBLIC_CONFIG_INVALID') {
    return productsFailure('INVALID_INPUT', error.message);
  }
  return productsFailure('REPOSITORY_FAILURE', error.message);
}

export function isPublicPriceUnavailable(error: PricingDomainError) {
  return error.code === 'PUBLIC_PRICE_NOT_FOUND' || error.code === 'CURRENCY_UNAVAILABLE';
}

export function productsFailure(
  code: ProductsDomainError['code'],
  message: string,
): ProductsResult<never> {
  return { ok: false, error: { domain: 'products', code, message } };
}
