import 'server-only';

import type { PublicTenantConfigResolver } from '@/core/tenant/interfaces';
import { CommerceSdkError } from './errors';
import type { CommerceClient } from './types';
import type { CommerceDataRepository } from './internal/dependencies';
import { resolveTenant } from './internal/resolveTenant';

export function createCategoriesApi(input: {
  tenantSlug: string;
  resolver: PublicTenantConfigResolver;
  repository: CommerceDataRepository;
}): CommerceClient['categories'] {
  return {
    async list() {
      const tenant = await resolveTenant(
        input.resolver,
        input.tenantSlug,
        'categories.list',
        true,
      );
      try {
        const categories = await input.repository.listPublicCategories(tenant.id);
        return categories
          .filter((category) => category.active)
          .map(({ id, name }) => ({ id, name }));
      } catch {
        throw new CommerceSdkError(
          'REPOSITORY_FAILURE',
          'categories.list',
          'The public categories could not be loaded.',
        );
      }
    },
  };
}
