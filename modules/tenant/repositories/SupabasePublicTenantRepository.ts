import type {
  PublicTenantRepository,
  PublicTenantSnapshot,
} from '@/core/tenant/interfaces';
import { supabaseServer } from '@/lib/supabaseServer';

export class SupabasePublicTenantRepository implements PublicTenantRepository {
  async loadPublicTenantSnapshot(slug: string): Promise<PublicTenantSnapshot | null> {
    let tenantResult = await supabaseServer
      .from('tenants')
      .select(`
        id,
        slug,
        status,
        name,
        contact_email,
        whatsapp_phone,
        website_url,
        logo_url,
        primary_color,
        secondary_color,
        currency,
        locale,
        default_price_list_id,
        feature_show_prices,
        feature_public_catalog,
        feature_orders,
        feature_wholesale_login,
        feature_multiple_price_lists,
        feature_importer,
        feature_images,
        feature_stock,
        feature_invoicing
      `)
      .eq('slug', slug)
      .maybeSingle();

    if (isSetupSchemaCompatibilityError(tenantResult.error?.message ?? null)) {
      tenantResult = await supabaseServer
        .from('tenants')
        .select(`
          id,
          slug,
          status,
          name,
          contact_email,
          whatsapp_phone,
          website_url,
          logo_url,
          primary_color,
          secondary_color,
          currency,
          default_price_list_id,
          feature_public_catalog,
          feature_orders,
          feature_wholesale_login,
          feature_multiple_price_lists,
          feature_importer,
          feature_images,
          feature_stock,
          feature_invoicing
        `)
        .eq('slug', slug)
        .maybeSingle() as typeof tenantResult;
    }

    const { data: tenant, error: tenantError } = tenantResult;

    if (tenantError) throw new Error(tenantError.message);
    if (!tenant) return null;

    const { data: priceLists, error: priceListsError } = await supabaseServer
      .from('price_lists')
      .select('id, code, name, is_active, is_default')
      .eq('tenant_id', tenant.id);
    if (priceListsError) throw new Error(priceListsError.message);

    return {
      id: String(tenant.id),
      slug: String(tenant.slug),
      status: tenant.status === 'active' ? 'active' : 'inactive',
      commercialName: String(tenant.name ?? ''),
      websiteUrl: tenant.website_url ? String(tenant.website_url) : null,
      whatsapp: tenant.whatsapp_phone ? String(tenant.whatsapp_phone) : null,
      email: tenant.contact_email ? String(tenant.contact_email) : null,
      currency: String(tenant.currency ?? ''),
      locale: tenant.locale ? String(tenant.locale) : null,
      defaultPriceListId: tenant.default_price_list_id
        ? String(tenant.default_price_list_id)
        : null,
      branding: {
        logoUrl: tenant.logo_url ? String(tenant.logo_url) : null,
        primaryColor: String(tenant.primary_color ?? ''),
        secondaryColor: String(tenant.secondary_color ?? ''),
      },
      features: {
        showPrices: tenant.feature_show_prices ?? true,
        publicCatalog: tenant.feature_public_catalog ?? true,
        orders: tenant.feature_orders ?? true,
        accountLogin: tenant.feature_wholesale_login ?? false,
        multiplePriceLists: tenant.feature_multiple_price_lists ?? true,
        importer: tenant.feature_importer ?? true,
        images: tenant.feature_images ?? false,
        stock: tenant.feature_stock ?? false,
        invoicing: tenant.feature_invoicing ?? false,
      },
      priceLists: (priceLists ?? []).map((priceList) => ({
        id: String(priceList.id),
        code: String(priceList.code),
        name: String(priceList.name),
        active: priceList.is_active === true,
        isDefault: priceList.is_default === true,
      })),
    };
  }
}

function isSetupSchemaCompatibilityError(message: string | null) {
  return Boolean(message && /feature_show_prices|locale/i.test(message));
}
