import 'server-only';

import { resolveCommerceClientTenant } from '@/sdk/server/internal/clientContext';
import type { CommerceClient } from '@/sdk/server/types';
import type { PublicCommerceTenant } from '../types';

export async function resolvePublicCommerceTenant(
  commerce: CommerceClient,
): Promise<PublicCommerceTenant> {
  const tenant = await resolveCommerceClientTenant(commerce);
  return {
    id: tenant.id,
    slug: tenant.slug,
    commercialName: tenant.commercialName,
    currency: tenant.currency,
    locale: tenant.locale,
    enabled: tenant.features.orders,
    priceList: {
      id: tenant.priceList.id,
      code: tenant.priceList.code,
      name: tenant.priceList.name,
    },
  };
}
