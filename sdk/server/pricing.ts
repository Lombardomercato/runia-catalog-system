import 'server-only';

import {
  toPublicPricingTenant,
  toResolvedPublicPriceLists,
} from '@/core/products/publicCatalogPolicy';
import type { PublicPriceResolver } from '@/core/pricing/interfaces';
import type { PublicTenantConfigResolver } from '@/core/tenant/interfaces';
import {
  commerceErrorFromDomain,
  CommerceSdkError,
} from './errors';
import type { CommerceClient } from './types';
import type { CommerceDataRepository } from './internal/dependencies';
import { resolveTenant } from './internal/resolveTenant';

export function createPricingApi(input: {
  tenantSlug: string;
  resolver: PublicTenantConfigResolver;
  repository: CommerceDataRepository;
  pricing: PublicPriceResolver;
}): CommerceClient['pricing'] {
  return {
    async resolve(query) {
      if (!query || typeof query.productId !== 'string' || !query.productId.trim()) {
        throw new CommerceSdkError(
          'INVALID_INPUT',
          'pricing.resolve',
          'A valid product ID is required.',
        );
      }
      const productId = query.productId.trim();
      const tenant = await resolveTenant(
        input.resolver,
        input.tenantSlug,
        'pricing.resolve',
        true,
      );
      let context;
      try {
        context = await input.repository.loadPublicPriceContext(
          tenant.id,
          productId,
          tenant.priceList.id,
        );
      } catch {
        throw new CommerceSdkError(
          'REPOSITORY_FAILURE',
          'pricing.resolve',
          'The public price context could not be loaded.',
        );
      }
      if (!context) {
        throw new CommerceSdkError(
          'PRODUCT_NOT_FOUND',
          'pricing.resolve',
          'The public product was not found.',
        );
      }
      if (
        !context.productActive ||
        !context.categoryActive ||
        !context.brandActive
      ) {
        throw new CommerceSdkError(
          'PRODUCT_NOT_VISIBLE',
          'pricing.resolve',
          'The product is not publicly visible.',
        );
      }
      const result = input.pricing.execute({
        tenant: toPublicPricingTenant(tenant),
        priceLists: toResolvedPublicPriceLists(tenant),
        productId: context.productId,
        prices: context.prices,
      });
      if (!result.ok) throw commerceErrorFromDomain(result.error, 'pricing.resolve');
      return {
        productId: result.value.productId,
        amount: result.value.unitPrice.amount,
        currency: result.value.unitPrice.currency,
        source: result.value.source,
      };
    },
  };
}
