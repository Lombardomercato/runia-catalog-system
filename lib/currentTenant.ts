import { cookies } from 'next/headers';

export const SELECTED_TENANT_COOKIE = 'runia_selected_tenant_slug';

export async function getCurrentTenantSlug() {
  const cookieStore = await cookies();
  const selectedTenantSlug = cookieStore.get(SELECTED_TENANT_COOKIE)?.value.trim();
  const fallbackTenantSlug = process.env.NEXT_PUBLIC_TENANT_SLUG?.trim();
  const tenantSlug = selectedTenantSlug || fallbackTenantSlug;

  if (!tenantSlug) {
    throw new Error('Falta configurar NEXT_PUBLIC_TENANT_SLUG.');
  }

  return tenantSlug;
}
