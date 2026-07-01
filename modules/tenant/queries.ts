import { supabaseServer } from '@/lib/supabaseServer';
import { mapTenantSettings } from './mapper';
import type {
  TenantIdentityResult,
  TenantPriceListOption,
  TenantRow,
  TenantSettingsResult,
} from './types';

const TENANT_SETTINGS_SELECT = `
  id,
  slug,
  status,
  name,
  legal_name,
  contact_email,
  whatsapp_phone,
  address,
  website_url,
  logo_url,
  primary_color,
  secondary_color,
  currency,
  minimum_order_amount,
  minimum_purchase_amount,
  default_price_list_id,
  feature_public_catalog,
  feature_orders,
  feature_wholesale_login,
  feature_multiple_price_lists,
  feature_importer,
  feature_images,
  feature_stock,
  feature_invoicing,
  updated_at
`;

export async function getTenantIdentity(tenantSlug: string): Promise<TenantIdentityResult> {
  const { data, error } = await supabaseServer
    .from('tenants')
    .select('id, slug, name, currency')
    .eq('slug', tenantSlug)
    .eq('status', 'active')
    .single();

  if (error || !data) {
    return {
      tenant: null,
      error: `No se encontro el cliente "${tenantSlug}".`,
    };
  }

  return {
    tenant: data,
    error: null,
  };
}

export async function getTenantSettings(tenantSlug: string): Promise<TenantSettingsResult> {
  const { data, error } = await supabaseServer
    .from('tenants')
    .select(TENANT_SETTINGS_SELECT)
    .eq('slug', tenantSlug)
    .eq('status', 'active')
    .single();

  if (error || !data) {
    return {
      tenant: null,
      error:
        error?.message ??
        `No se encontro el cliente "${tenantSlug}". Ejecuta la migracion 003_tenant_settings.sql si faltan columnas.`,
    };
  }

  const priceLists = await getTenantPriceLists(data.id);

  if (priceLists.error) {
    return {
      tenant: null,
      error: priceLists.error,
    };
  }

  return {
    tenant: mapTenantSettings(data as TenantRow, priceLists.priceLists),
    error: null,
  };
}

async function getTenantPriceLists(tenantId: string): Promise<{
  priceLists: TenantPriceListOption[];
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('price_lists')
    .select('id, code, name, is_default')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    return {
      priceLists: [],
      error: error.message,
    };
  }

  return {
    priceLists: (data ?? []).map((priceList) => ({
      id: priceList.id,
      code: priceList.code,
      name: priceList.name,
      isDefault: priceList.is_default,
    })),
    error: null,
  };
}
