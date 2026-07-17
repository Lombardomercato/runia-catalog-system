import 'server-only';

import type {
  GetPublicProductBySkuOutput,
  ListFeaturedPublicProductsOutput,
  ListPublicProductsOutput,
  PublicProductListItem,
} from '@/core/products/interfaces';
import type { GetPublicProductBySku } from '@/core/products/use-cases/GetPublicProductBySku';
import type { ListFeaturedPublicProducts } from '@/core/products/use-cases/ListFeaturedPublicProducts';
import type { ListPublicProducts } from '@/core/products/use-cases/ListPublicProducts';
import { commerceErrorFromDomain, CommerceSdkError } from './errors';
import type {
  CommerceClient,
  CommerceMoney,
  CommerceProduct,
  CommerceProductDetail,
} from './types';

export function createProductsApi(input: {
  tenantSlug: string;
  listProducts: ListPublicProducts;
  getProductBySku: GetPublicProductBySku;
  listFeaturedProducts: ListFeaturedPublicProducts;
}): CommerceClient['products'] {
  return {
    async list(query = {}) {
      if (!query || typeof query !== 'object' || Array.isArray(query)) {
        throw new CommerceSdkError(
          'INVALID_INPUT',
          'products.list',
          'A valid public product query is required.',
        );
      }
      const result = await input.listProducts.execute({
        tenantSlug: input.tenantSlug,
        search: query.search,
        categoryId: query.category,
        brandId: query.brand,
        sort: query.sort,
        page: query.page,
        pageSize: query.pageSize,
      });
      if (!result.ok) throw commerceErrorFromDomain(result.error, 'products.list');
      return mapProductList(result.value);
    },

    async getBySku(sku) {
      if (typeof sku !== 'string') {
        throw new CommerceSdkError(
          'INVALID_INPUT',
          'products.getBySku',
          'A valid product SKU is required.',
        );
      }
      const result = await input.getProductBySku.execute({
        tenantSlug: input.tenantSlug,
        sku,
      });
      if (!result.ok) throw commerceErrorFromDomain(result.error, 'products.getBySku');
      return mapProductDetail(result.value);
    },

    async featured(query = {}) {
      if (!query || typeof query !== 'object' || Array.isArray(query)) {
        throw new CommerceSdkError(
          'INVALID_INPUT',
          'products.featured',
          'A valid featured product query is required.',
        );
      }
      const result = await input.listFeaturedProducts.execute({
        tenantSlug: input.tenantSlug,
        limit: query.limit,
        categoryId: query.category,
        brandId: query.brand,
      });
      if (!result.ok) throw commerceErrorFromDomain(result.error, 'products.featured');
      return mapFeaturedProducts(result.value);
    },
  };
}

function mapFeaturedProducts(output: ListFeaturedPublicProductsOutput) {
  return output.products.map((product) => mapProduct(product, 'products.featured'));
}

function mapProductList(output: ListPublicProductsOutput) {
  return {
    products: output.products.map((product) => mapProduct(product, 'products.list')),
    categories: output.categories.map(({ id, name }) => ({ id, name })),
    brands: output.brands.map(({ id, name }) => ({ id, name })),
    pagination: { ...output.pagination },
    totalProducts: output.totalVisibleProducts,
  };
}

function mapProductDetail(output: GetPublicProductBySkuOutput): CommerceProductDetail {
  return {
    ...mapProduct(output.product, 'products.getBySku'),
    description: output.product.description,
  };
}

function mapProduct(
  product: PublicProductListItem,
  operation: 'products.list' | 'products.featured' | 'products.getBySku',
): CommerceProduct {
  if (!product.price) {
    throw new CommerceSdkError(
      'PUBLIC_PRICE_NOT_FOUND',
      operation,
      'The product has no public price.',
    );
  }
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    productLine: product.line,
    variant: product.variant,
    category: { id: product.categoryId, name: product.categoryName },
    brand: { id: product.brandId, name: product.brandName },
    price: mapMoney(product.price),
  };
}

function mapMoney(money: { amount: string; currency: string }): CommerceMoney {
  return { amount: money.amount, currency: money.currency };
}
