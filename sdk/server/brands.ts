import 'server-only';

import type { PublicTenantConfigResolver } from '@/core/tenant/interfaces';
import { CommerceSdkError } from './errors';
import type { CommerceClient } from './types';
import type { CommerceDataRepository } from './internal/dependencies';
import { resolveTenant } from './internal/resolveTenant';

export function createBrandsApi(input: {
  tenantSlug: string;
  resolver: PublicTenantConfigResolver;
  repository: CommerceDataRepository;
}): CommerceClient['brands'] {
  return {
    async list() {
      const tenant = await resolveTenant(
        input.resolver,
        input.tenantSlug,
        'brands.list',
        true,
      );
      try {
        const brands = await input.repository.listPublicBrands(tenant.id);
        return brands
          .filter((brand) => brand.active)
          .map(({ id, name }) => ({ id, name }));
      } catch {
        throw new CommerceSdkError(
          'REPOSITORY_FAILURE',
          'brands.list',
          'The public brands could not be loaded.',
        );
      }
    },
  };
}
