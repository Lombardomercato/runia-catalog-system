import 'server-only';

import { resolvePublicCatalogContext } from '@/core/products/publicCatalogPolicy';
import type {
  PublicTenantConfigResolver,
  TenantPublicConfig,
} from '@/core/tenant/interfaces';
import {
  commerceErrorFromDomain,
  type CommerceSdkOperation,
} from '../errors';

export async function resolveTenant(
  resolver: PublicTenantConfigResolver,
  tenantSlug: string,
  operation: CommerceSdkOperation,
  requirePublicCatalog = false,
): Promise<TenantPublicConfig> {
  const result = await resolver.execute({ slug: tenantSlug });
  if (!result.ok) throw commerceErrorFromDomain(result.error, operation);
  if (requirePublicCatalog) {
    const context = resolvePublicCatalogContext(result.value);
    if (!context.ok) throw commerceErrorFromDomain(context.error, operation);
  }
  return result.value;
}
