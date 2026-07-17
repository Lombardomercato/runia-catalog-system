import 'server-only';

import { ResolvePublicPrice } from '@/core/pricing/use-cases/ResolvePublicPrice';
import { SupabasePublicProductsRepository } from '@/modules/catalog/repositories/SupabasePublicProductsRepository';
import { SupabasePublicTenantRepository } from '@/modules/tenant/repositories/SupabasePublicTenantRepository';
import type { CommerceClient, CommerceClientConfig } from './types';
import { createCommerceClientWithDependencies } from './internal/createCommerceClientWithDependencies';

export function createCommerceClient(config: CommerceClientConfig): CommerceClient {
  return createCommerceClientWithDependencies(config, {
    tenantRepository: new SupabasePublicTenantRepository(),
    dataRepository: new SupabasePublicProductsRepository(),
    priceResolver: new ResolvePublicPrice(),
  });
}
