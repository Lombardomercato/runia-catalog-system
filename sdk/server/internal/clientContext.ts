import 'server-only';

import type {
  PublicTenantConfigResolver,
  TenantPublicConfig,
} from '@/core/tenant/interfaces';
import type { CommerceClient } from '../types';
import { resolveTenant } from './resolveTenant';

type CommerceClientContext = {
  tenantSlug: string;
  tenantResolver: PublicTenantConfigResolver;
};

const contexts = new WeakMap<CommerceClient, CommerceClientContext>();

export function registerCommerceClientContext(
  client: CommerceClient,
  context: CommerceClientContext,
) {
  contexts.set(client, context);
}

export function resolveCommerceClientTenant(
  client: CommerceClient,
): Promise<TenantPublicConfig> {
  const context = contexts.get(client);
  if (!context) throw new Error('The Commerce client context is unavailable.');
  return resolveTenant(
    context.tenantResolver,
    context.tenantSlug,
    'tenant.getPublicConfig',
  );
}
