import 'server-only';

import type {
  GetPublicTenantConfigInput,
  PublicTenantConfigResolver,
} from '@/core/tenant/interfaces';

export class ScopedTenantResolver implements PublicTenantConfigResolver {
  private cached: ReturnType<PublicTenantConfigResolver['execute']> | null = null;

  constructor(
    private readonly tenantSlug: string,
    private readonly delegate: PublicTenantConfigResolver,
  ) {}

  execute(input: GetPublicTenantConfigInput) {
    if (input.slug.trim() !== this.tenantSlug) {
      return this.delegate.execute(input);
    }
    if (!this.cached) {
      this.cached = this.delegate.execute({ slug: this.tenantSlug });
    }
    return this.cached;
  }
}
