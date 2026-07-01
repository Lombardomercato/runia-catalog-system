import type {
  GetPublicProductBySkuOutput,
  ListPublicProductsOutput,
  PublicCatalogTenant as DomainPublicCatalogTenant,
  PublicProductListItem,
} from '@/core/products/interfaces';
import type {
  CatalogProduct,
  CatalogTenant,
} from './types';

export function mapPublicProductsOutput(output: ListPublicProductsOutput) {
  return {
    tenant: mapDomainTenant(output.tenant),
    products: output.products.map(mapDomainProduct),
    categories: output.categories,
    brands: output.brands,
    totalProducts: output.totalVisibleProducts,
  };
}

export function mapPublicProductOutput(output: GetPublicProductBySkuOutput) {
  return {
    tenant: mapDomainTenant(output.tenant),
    product: mapDomainProduct(output.product),
  };
}

function mapDomainTenant(tenant: DomainPublicCatalogTenant): CatalogTenant {
  return {
    id: tenant.id,
    slug: tenant.slug,
    commercialName: tenant.commercialName,
    whatsapp: tenant.whatsapp,
    email: tenant.email,
    websiteUrl: tenant.websiteUrl,
    logoUrl: tenant.branding.logoUrl,
    primaryColor: tenant.branding.primaryColor,
    secondaryColor: tenant.branding.secondaryColor,
    primaryContrast: contrastColor(tenant.branding.primaryColor),
    secondaryContrast: contrastColor(tenant.branding.secondaryColor),
    currency: tenant.currency,
    locale: tenant.locale,
    features: tenant.features,
    publicCatalogEnabled: tenant.features.publicCatalog,
    priceList: tenant.priceList,
  };
}

function mapDomainProduct(product: PublicProductListItem): CatalogProduct {
  const price = product.price ? Number(product.price.amount) : null;
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    productLine: product.line,
    variant: product.variant,
    description: product.description,
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    brandId: product.brandId,
    brandName: product.brandName,
    price: price !== null && Number.isFinite(price) ? price : null,
    currency: product.price?.currency ?? 'ARS',
  };
}

function contrastColor(hex: string) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '0f172a';
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 150 ? '#111827' : '#ffffff';
}
