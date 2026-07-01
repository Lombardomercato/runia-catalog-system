'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabaseServer';
import { tenantSlugExists } from './queries';
import { validateCreateTenantInput } from './validators';
import type {
  CreateTenantInput,
  NormalizedCreateTenantInput,
  TenantCommandFieldErrors,
  TenantCommandResult,
} from './types';

type TenantInsertRow = {
  id: string;
  slug: string;
};

type PriceListInsertRow = {
  id: string;
  code: string;
};

export async function createTenant(input: CreateTenantInput): Promise<TenantCommandResult> {
  const validation = validateCreateTenantInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }

  const existingSlug = await tenantSlugExists(validation.value.slug);

  if (existingSlug.error) {
    return commandError(existingSlug.error);
  }

  if (existingSlug.exists) {
    return commandError('Hay campos que necesitan revision.', {
      slug: 'Ya existe un tenant con este slug.',
    });
  }

  const tenant = await insertTenant(validation.value);

  if (!tenant.record) {
    return commandError(tenant.error);
  }

  const priceLists = await insertBasePriceLists(tenant.record.id);

  if (!priceLists.records) {
    await rollbackTenant(tenant.record.id);
    return commandError(priceLists.error);
  }

  const defaultPriceListId = priceLists.records.find((priceList) => priceList.code === 'minorista')?.id;

  if (!defaultPriceListId) {
    await rollbackTenant(tenant.record.id);
    return commandError('No se pudo crear la lista de precio base Minorista.');
  }

  const defaultWrite = await setDefaultPriceList(tenant.record.id, defaultPriceListId);

  if (defaultWrite.error) {
    await rollbackTenant(tenant.record.id);
    return commandError(defaultWrite.error);
  }

  revalidateRuniaPaths();

  return {
    ok: true,
    affected: 1,
    message: 'Tenant creado y listo para importar catalogo.',
    error: null,
    fieldErrors: {},
    tenantId: tenant.record.id,
    tenantSlug: tenant.record.slug,
  };
}

async function insertTenant(input: NormalizedCreateTenantInput): Promise<{
  record: TenantInsertRow | null;
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('tenants')
    .insert({
      name: input.name,
      slug: input.slug,
      status: 'active',
      logo_url: null,
      primary_color: input.primaryColor,
      secondary_color: input.secondaryColor,
      currency: 'ARS',
      minimum_order_amount: 0,
      minimum_purchase_amount: 0,
      feature_public_catalog: true,
      feature_orders: true,
      feature_wholesale_login: false,
      feature_multiple_price_lists: true,
      feature_importer: true,
      feature_images: false,
      feature_stock: false,
      feature_invoicing: false,
    })
    .select('id, slug')
    .single();

  return {
    record: data as TenantInsertRow | null,
    error: formatTenantSettingsError(error?.message ?? null),
  };
}

async function insertBasePriceLists(tenantId: string): Promise<{
  records: PriceListInsertRow[] | null;
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('price_lists')
    .insert([
      {
        tenant_id: tenantId,
        name: 'Minorista',
        code: 'minorista',
        is_default: true,
        is_active: true,
      },
      {
        tenant_id: tenantId,
        name: 'Mayorista',
        code: 'mayorista',
        is_default: false,
        is_active: true,
      },
    ])
    .select('id, code');

  return {
    records: data as PriceListInsertRow[] | null,
    error: error?.message ?? null,
  };
}

async function setDefaultPriceList(tenantId: string, priceListId: string) {
  const { error } = await supabaseServer
    .from('tenants')
    .update({ default_price_list_id: priceListId })
    .eq('id', tenantId);

  return {
    error: formatTenantSettingsError(error?.message ?? null),
  };
}

async function rollbackTenant(tenantId: string) {
  await supabaseServer.from('tenants').delete().eq('id', tenantId);
}

function commandError(
  error: string | null,
  fieldErrors: TenantCommandFieldErrors = {},
): TenantCommandResult {
  return {
    ok: false,
    affected: 0,
    message: null,
    error: error ?? 'No se pudo completar la operacion.',
    fieldErrors,
  };
}

function revalidateRuniaPaths() {
  for (const path of ['/runia', '/admin']) {
    try {
      revalidatePath(path);
    } catch {
      // Server actions provide the static generation store; scripts/tests do not.
    }
  }
}

function formatTenantSettingsError(error: string | null) {
  if (!error) {
    return null;
  }

  const missingSettingsColumn =
    error.includes('logo_url') ||
    error.includes('primary_color') ||
    error.includes('secondary_color') ||
    error.includes('feature_public_catalog') ||
    error.includes('default_price_list_id');

  if (missingSettingsColumn) {
    return 'Faltan columnas de tenant settings. Ejecuta db/migrations/003_tenant_settings.sql antes de crear tenants desde la consola SaaS.';
  }

  return error;
}
