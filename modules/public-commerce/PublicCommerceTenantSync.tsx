'use client';

import { useEffect } from 'react';
import { usePublicCommerce } from './PublicCommerceProvider';
import type { PublicCommerceTenant } from './types';

export function PublicCommerceTenantSync({ tenant }: { tenant: PublicCommerceTenant }) {
  const { configureTenant } = usePublicCommerce();

  useEffect(() => {
    void configureTenant(tenant);
  }, [
    configureTenant,
    tenant.commercialName,
    tenant.currency,
    tenant.enabled,
    tenant.id,
    tenant.locale,
    tenant.priceList?.code,
    tenant.priceList?.id,
    tenant.priceList?.name,
    tenant.slug,
  ]);

  return null;
}
