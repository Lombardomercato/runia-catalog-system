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
    tenant.currency,
    tenant.enabled,
    tenant.id,
    tenant.locale,
    tenant.slug,
  ]);

  return null;
}
