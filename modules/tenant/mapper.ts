import type { TenantPriceListOption, TenantRow, TenantSettings } from './types';

const DEFAULT_PRIMARY_COLOR = '#14b8a6';
const DEFAULT_SECONDARY_COLOR = '#0f172a';
const DEFAULT_CURRENCY = 'ARS';

export function mapTenantSettings(
  row: TenantRow,
  priceLists: TenantPriceListOption[],
): TenantSettings {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    updatedAt: row.updated_at,
    company: {
      commercialName: row.name,
      legalName: row.legal_name,
      email: row.contact_email,
      whatsapp: row.whatsapp_phone,
      address: row.address,
      website: row.website_url,
    },
    branding: {
      logoUrl: row.logo_url,
      primaryColor: row.primary_color ?? DEFAULT_PRIMARY_COLOR,
      secondaryColor: row.secondary_color ?? DEFAULT_SECONDARY_COLOR,
    },
    commercial: {
      currency: row.currency ?? DEFAULT_CURRENCY,
      minimumOrderAmount: toNumber(row.minimum_order_amount),
      minimumPurchaseAmount: toNumber(row.minimum_purchase_amount),
      defaultPriceListId: row.default_price_list_id,
    },
    features: {
      showPrices: row.feature_show_prices ?? true,
      publicCatalog: row.feature_public_catalog ?? true,
      orders: row.feature_orders ?? true,
      wholesaleLogin: row.feature_wholesale_login ?? false,
      multiplePriceLists: row.feature_multiple_price_lists ?? true,
      importer: row.feature_importer ?? true,
      images: row.feature_images ?? false,
      stock: row.feature_stock ?? false,
      invoicing: row.feature_invoicing ?? false,
    },
    priceLists,
  };
}

function toNumber(value: number | string | null) {
  if (value === null) {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : 0;
}
