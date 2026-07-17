import 'server-only';

import type { PublicTenantConfigResolver } from '@/core/tenant/interfaces';
import type { CommerceClient, CommerceTenantPublicConfig } from './types';
import { CommerceSdkError } from './errors';
import { resolveTenant } from './internal/resolveTenant';

export function createTenantApi(input: {
  tenantSlug: string;
  resolver: PublicTenantConfigResolver;
}): CommerceClient['tenant'] {
  return {
    async getPublicConfig() {
      const tenant = await resolveTenant(
        input.resolver,
        input.tenantSlug,
        'tenant.getPublicConfig',
      );
      return mapTenant(tenant);
    },

    async buildWhatsAppUrl(query) {
      if (
        !query ||
        typeof query.message !== 'string' ||
        !query.message.trim() ||
        query.message.length > 2000
      ) {
        throw new CommerceSdkError(
          'INVALID_INPUT',
          'tenant.buildWhatsAppUrl',
          'A message between 1 and 2000 characters is required.',
        );
      }
      const tenant = await resolveTenant(
        input.resolver,
        input.tenantSlug,
        'tenant.buildWhatsAppUrl',
      );
      const destination = normalizeWhatsApp(tenant.whatsapp);
      if (!destination) {
        return { available: false, url: null, code: 'WHATSAPP_NOT_CONFIGURED' };
      }
      return {
        available: true,
        url: `https://wa.me/${destination}?text=${encodeURIComponent(query.message)}`,
        code: null,
      };
    },
  };
}

function normalizeWhatsApp(value: string | null) {
  const digits = value?.replace(/\D/g, '').replace(/^00/, '') ?? '';
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function mapTenant(
  tenant: Awaited<ReturnType<typeof resolveTenant>>,
): CommerceTenantPublicConfig {
  return {
    name: tenant.commercialName,
    slug: tenant.slug,
    logoUrl: tenant.branding.logoUrl,
    primaryColor: tenant.branding.primaryColor,
    secondaryColor: tenant.branding.secondaryColor,
    whatsapp: tenant.whatsapp,
    email: tenant.email,
    currency: tenant.currency,
    locale: tenant.locale,
    features: {
      showPrices: tenant.features.showPrices,
      publicCatalog: tenant.features.publicCatalog,
      orders: tenant.features.orders,
      accountLogin: tenant.features.accountLogin,
      multiplePriceLists: tenant.features.multiplePriceLists,
      images: tenant.features.images,
      stock: tenant.features.stock,
    },
  };
}
