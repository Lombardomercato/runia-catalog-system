import { cookies, headers } from 'next/headers';
import {
  resolveTenantSlug,
  type TenantResolutionSurface,
} from '@/lib/tenantResolver';

export const SELECTED_TENANT_COOKIE = 'runia_selected_tenant_slug';

export async function getCurrentTenantSlug(
  surface: TenantResolutionSurface = 'internal',
) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const selectedTenantSlug = cookieStore.get(SELECTED_TENANT_COOKIE)?.value.trim();
  const fallbackTenantSlug = process.env.NEXT_PUBLIC_TENANT_SLUG?.trim();
  const hostname =
    headerStore.get('x-forwarded-host') ??
    headerStore.get('host');

  return resolveTenantSlug({
    hostname,
    surface,
    selectedTenantSlug,
    fallbackTenantSlug,
    nodeEnv: process.env.NODE_ENV,
  });
}
