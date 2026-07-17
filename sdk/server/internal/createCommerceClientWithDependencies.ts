import 'server-only';

import { GetPublicProductBySku } from '@/core/products/use-cases/GetPublicProductBySku';
import { ListPublicProducts } from '@/core/products/use-cases/ListPublicProducts';
import { ListFeaturedPublicProducts } from '@/core/products/use-cases/ListFeaturedPublicProducts';
import { GetPublicTenantConfig } from '@/core/tenant/use-cases/GetPublicTenantConfig';
import { commerceErrorGuards, CommerceSdkError } from '../errors';
import { createBrandsApi } from '../brands';
import { createCategoriesApi } from '../categories';
import { createPricingApi } from '../pricing';
import { createProductsApi } from '../products';
import { createTenantApi } from '../tenant';
import type { CommerceClient, CommerceClientConfig } from '../types';
import type { CommerceClientDependencies } from './dependencies';
import { registerCommerceClientContext } from './clientContext';
import { ScopedTenantResolver } from './scopedTenantResolver';

export function createCommerceClientWithDependencies(
  config: CommerceClientConfig,
  dependencies: CommerceClientDependencies,
): CommerceClient {
  const tenantSlug = typeof config?.tenantSlug === 'string'
    ? config.tenantSlug.trim()
    : '';
  if (!tenantSlug || tenantSlug.length > 120) {
    throw new CommerceSdkError(
      'INVALID_CLIENT_CONFIG',
      'client',
      'A valid tenantSlug is required.',
    );
  }

  const tenantUseCase = new GetPublicTenantConfig(
    dependencies.tenantRepository,
    dependencies.priceResolver,
  );
  const tenantResolver = new ScopedTenantResolver(tenantSlug, tenantUseCase);
  const listProducts = new ListPublicProducts(
    dependencies.dataRepository,
    dependencies.priceResolver,
    tenantResolver,
  );
  const listFeaturedProducts = new ListFeaturedPublicProducts(
    dependencies.dataRepository,
    dependencies.priceResolver,
    tenantResolver,
  );
  const getProductBySku = new GetPublicProductBySku(
    dependencies.dataRepository,
    dependencies.priceResolver,
    tenantResolver,
  );

  const client: CommerceClient = {
    tenant: createTenantApi({ tenantSlug, resolver: tenantResolver }),
    products: createProductsApi({
      tenantSlug,
      listProducts,
      listFeaturedProducts,
      getProductBySku,
    }),
    categories: createCategoriesApi({
      tenantSlug,
      resolver: tenantResolver,
      repository: dependencies.dataRepository,
    }),
    brands: createBrandsApi({
      tenantSlug,
      resolver: tenantResolver,
      repository: dependencies.dataRepository,
    }),
    pricing: createPricingApi({
      tenantSlug,
      resolver: tenantResolver,
      repository: dependencies.dataRepository,
      pricing: dependencies.priceResolver,
    }),
    errors: commerceErrorGuards,
  };
  registerCommerceClientContext(client, { tenantSlug, tenantResolver });
  return Object.freeze(client);
}
