import { createCommerceClient } from '@/sdk/server';

export function createDemoCommerce() {
  return createCommerceClient({
    tenantSlug: process.env.NEXT_PUBLIC_TENANT_SLUG ?? 'rb-distribuidora',
  });
}
