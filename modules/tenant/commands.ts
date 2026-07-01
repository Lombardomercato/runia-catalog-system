'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabaseServer';
import {
  validateUpdateBrandingInput,
  validateUpdateCommercialSettingsInput,
  validateUpdateFeatureFlagsInput,
  validateUpdateTenantInput,
} from './validators';
import type {
  NormalizedUpdateBrandingInput,
  NormalizedUpdateCommercialSettingsInput,
  NormalizedUpdateFeatureFlagsInput,
  NormalizedUpdateTenantInput,
  TenantCommandFieldErrors,
  TenantCommandResult,
  UpdateBrandingInput,
  UpdateCommercialSettingsInput,
  UpdateFeatureFlagsInput,
  UpdateTenantInput,
} from './types';

type TenantRecord = {
  id: string;
  slug: string;
};

export async function updateTenant(input: UpdateTenantInput): Promise<TenantCommandResult> {
  const validation = validateUpdateTenantInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }

  const tenant = await getTenant(validation.value.tenantSlug);

  if (!tenant.record) {
    return commandError(tenant.error);
  }

  return writeTenantCompany(tenant.record.id, validation.value);
}

export async function updateBranding(input: UpdateBrandingInput): Promise<TenantCommandResult> {
  const validation = validateUpdateBrandingInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }

  const tenant = await getTenant(validation.value.tenantSlug);

  if (!tenant.record) {
    return commandError(tenant.error);
  }

  return writeTenantBranding(tenant.record.id, validation.value);
}

export async function updateCommercialSettings(
  input: UpdateCommercialSettingsInput,
): Promise<TenantCommandResult> {
  const validation = validateUpdateCommercialSettingsInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }

  const tenant = await getTenant(validation.value.tenantSlug);

  if (!tenant.record) {
    return commandError(tenant.error);
  }

  if (validation.value.defaultPriceListId) {
    const exists = await priceListBelongsToTenant(tenant.record.id, validation.value.defaultPriceListId);

    if (!exists) {
      return commandError('Hay campos que necesitan revision.', {
        defaultPriceListId: 'La lista de precios seleccionada no pertenece al cliente.',
      });
    }
  }

  return writeTenantCommercialSettings(tenant.record.id, validation.value);
}

export async function updateFeatureFlags(
  input: UpdateFeatureFlagsInput,
): Promise<TenantCommandResult> {
  const validation = validateUpdateFeatureFlagsInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }

  const tenant = await getTenant(validation.value.tenantSlug);

  if (!tenant.record) {
    return commandError(tenant.error);
  }

  return writeTenantFeatureFlags(tenant.record.id, validation.value);
}

async function writeTenantCompany(
  tenantId: string,
  input: NormalizedUpdateTenantInput,
): Promise<TenantCommandResult> {
  const { data, error } = await supabaseServer
    .from('tenants')
    .update({
      name: input.commercialName,
      legal_name: input.legalName,
      contact_email: input.email,
      whatsapp_phone: input.whatsapp,
      address: input.address,
      website_url: input.website,
    })
    .eq('id', tenantId)
    .select('updated_at')
    .single();

  return writeResult(error?.message ?? null, data?.updated_at, 'Empresa actualizada.');
}

async function writeTenantBranding(
  tenantId: string,
  input: NormalizedUpdateBrandingInput,
): Promise<TenantCommandResult> {
  const { data, error } = await supabaseServer
    .from('tenants')
    .update({
      primary_color: input.primaryColor,
      secondary_color: input.secondaryColor,
    })
    .eq('id', tenantId)
    .select('updated_at')
    .single();

  return writeResult(error?.message ?? null, data?.updated_at, 'Branding actualizado.');
}

async function writeTenantCommercialSettings(
  tenantId: string,
  input: NormalizedUpdateCommercialSettingsInput,
): Promise<TenantCommandResult> {
  const { data, error } = await supabaseServer
    .from('tenants')
    .update({
      currency: input.currency,
      minimum_order_amount: input.minimumOrderAmount,
      minimum_purchase_amount: input.minimumPurchaseAmount,
      default_price_list_id: input.defaultPriceListId,
    })
    .eq('id', tenantId)
    .select('updated_at')
    .single();

  return writeResult(error?.message ?? null, data?.updated_at, 'Configuracion comercial actualizada.');
}

async function writeTenantFeatureFlags(
  tenantId: string,
  input: NormalizedUpdateFeatureFlagsInput,
): Promise<TenantCommandResult> {
  const { data, error } = await supabaseServer
    .from('tenants')
    .update({
      feature_public_catalog: input.features.publicCatalog,
      feature_orders: input.features.orders,
      feature_wholesale_login: input.features.wholesaleLogin,
      feature_multiple_price_lists: input.features.multiplePriceLists,
      feature_importer: input.features.importer,
      feature_images: input.features.images,
      feature_stock: input.features.stock,
      feature_invoicing: input.features.invoicing,
    })
    .eq('id', tenantId)
    .select('updated_at')
    .single();

  return writeResult(error?.message ?? null, data?.updated_at, 'Funcionalidades actualizadas.');
}

async function getTenant(tenantSlug: string): Promise<{
  record: TenantRecord | null;
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('tenants')
    .select('id, slug')
    .eq('slug', tenantSlug)
    .eq('status', 'active')
    .single();

  if (error || !data) {
    return {
      record: null,
      error: `No se encontro el cliente "${tenantSlug}".`,
    };
  }

  return {
    record: data,
    error: null,
  };
}

async function priceListBelongsToTenant(tenantId: string, priceListId: string) {
  const { data, error } = await supabaseServer
    .from('price_lists')
    .select('id')
    .eq('id', priceListId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data);
}

function writeResult(
  error: string | null,
  updatedAt: string | undefined,
  message: string,
): TenantCommandResult {
  if (error) {
    return commandError(error);
  }

  revalidateTenantPaths();

  return {
    ok: true,
    affected: 1,
    message,
    error: null,
    fieldErrors: {},
    updatedAt,
  };
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

function revalidateTenantPaths() {
  for (const path of ['/admin/configuracion', '/admin', '/catalogo']) {
    try {
      revalidatePath(path);
    } catch {
      // Server actions provide the static generation store; scripts/tests do not.
    }
  }
}
