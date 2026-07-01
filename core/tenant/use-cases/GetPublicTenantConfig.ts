import type { TenantDomainError, TenantResult } from '../errors';
import type {
  GetPublicTenantConfigInput,
  PublicTenantConfigResolver,
  PublicTenantPriceResolver,
  PublicTenantRepository,
  TenantPublicConfig,
} from '../interfaces';

const DEFAULT_LOCALE = 'es-AR';
const DEFAULT_PRIMARY_COLOR = '#14b8a6';
const DEFAULT_SECONDARY_COLOR = '#0f172a';

export class GetPublicTenantConfig implements PublicTenantConfigResolver {
  constructor(
    private readonly repository: PublicTenantRepository,
    private readonly pricing: PublicTenantPriceResolver,
  ) {}

  async execute(
    input: GetPublicTenantConfigInput,
  ): Promise<TenantResult<TenantPublicConfig>> {
    const slug = input.slug.trim();
    if (!slug || slug.length > 120) {
      return tenantFailure('INVALID_INPUT', 'The tenant slug is required.');
    }

    let snapshot;
    try {
      snapshot = await this.repository.loadPublicTenantSnapshot(slug);
    } catch {
      return tenantFailure('REPOSITORY_FAILURE', 'The public tenant config could not be loaded.');
    }

    if (!snapshot) return tenantFailure('TENANT_NOT_FOUND', 'The tenant was not found.');
    if (snapshot.status !== 'active') {
      return tenantFailure('TENANT_INACTIVE', 'The tenant is inactive.');
    }

    const commercialName = snapshot.commercialName.trim();
    const currency = snapshot.currency.trim().toUpperCase();
    if (!commercialName || !/^[A-Z]{3}$/.test(currency)) {
      return tenantFailure('PUBLIC_CONFIG_INVALID', 'The public tenant config is invalid.');
    }

    const priceList = this.pricing.resolvePriceList({
      tenant: snapshot,
      priceLists: snapshot.priceLists,
    });
    if (!priceList.ok) {
      if (priceList.error.code === 'PUBLIC_PRICE_LIST_NOT_FOUND') {
        return tenantFailure('PUBLIC_PRICE_LIST_NOT_FOUND', priceList.error.message);
      }
      if (priceList.error.code === 'TENANT_INACTIVE') {
        return tenantFailure('TENANT_INACTIVE', priceList.error.message);
      }
      return tenantFailure('REPOSITORY_FAILURE', priceList.error.message);
    }

    return {
      ok: true,
      value: {
        id: snapshot.id,
        slug: snapshot.slug,
        commercialName,
        websiteUrl: publicUrl(snapshot.websiteUrl),
        whatsapp: nullableText(snapshot.whatsapp),
        email: nullableText(snapshot.email),
        currency,
        locale: normalizeLocale(snapshot.locale),
        defaultPriceListId: snapshot.defaultPriceListId,
        priceList: priceList.value,
        branding: {
          logoUrl: publicUrl(snapshot.branding.logoUrl),
          primaryColor: normalizeColor(snapshot.branding.primaryColor, DEFAULT_PRIMARY_COLOR),
          secondaryColor: normalizeColor(
            snapshot.branding.secondaryColor,
            DEFAULT_SECONDARY_COLOR,
          ),
        },
        features: { ...snapshot.features },
      },
    };
  }
}

function nullableText(value: string | null) {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}

function normalizeColor(value: string, fallback: string) {
  const normalized = value.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function publicUrl(value: string | null) {
  const normalized = nullableText(value);
  return normalized && /^https?:\/\//i.test(normalized) ? normalized : null;
}

function normalizeLocale(value: string | null) {
  const normalized = value?.trim() ?? '';
  return /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(normalized) ? normalized : DEFAULT_LOCALE;
}

function tenantFailure(
  code: TenantDomainError['code'],
  message: string,
): TenantResult<never> {
  return { ok: false, error: { domain: 'tenant', code, message } };
}
