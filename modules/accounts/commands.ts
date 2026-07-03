'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabaseServer';
import { getTenantIdentity } from '@/modules/tenant/queries';
import {
  validateCreateAccountInput,
  validateUpdateAccountInput,
  validateUpdateAccountPriceListInput,
  validateUpdateAccountStatusInput,
} from './validators';
import type {
  AccountCommandFieldErrors,
  AccountCommandResult,
  CreateAccountInput,
  CreateAccountFromSalesOrderSnapshotInput,
  NormalizedAccountInput,
  UpdateAccountInput,
  UpdateAccountPriceListInput,
  UpdateAccountStatusInput,
} from './types';

type TenantRecord = {
  id: string;
  slug: string;
};

export async function createAccount(input: CreateAccountInput): Promise<AccountCommandResult> {
  const validation = validateCreateAccountInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }

  const tenantResult = await getTenant(validation.value.tenantSlug);

  if (!tenantResult.tenant) {
    return commandError(tenantResult.error);
  }

  const preflight = await validateAccountPreflight(tenantResult.tenant.id, validation.value);

  if (preflight.error || Object.keys(preflight.fieldErrors).length > 0) {
    return commandError(preflight.error ?? 'Hay campos que necesitan revision.', preflight.fieldErrors);
  }

  const { data, error } = await supabaseServer
    .from('customer_accounts')
    .insert({
      tenant_id: tenantResult.tenant.id,
      ...toAccountWritePayload(validation.value),
    })
    .select('id, updated_at')
    .single();

  if (error) {
    return commandError(error.message);
  }

  revalidateAccountPaths(data.id);

  return commandSuccess('Account creada.', 1, data.updated_at, data.id);
}

export async function createAccountFromSalesOrderSnapshot(
  input: CreateAccountFromSalesOrderSnapshotInput,
): Promise<AccountCommandResult> {
  const validation = validateCreateAccountInput(input);
  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }
  const sourceOrderId = input.sourceOrderId.trim();
  if (!sourceOrderId) return commandError('No se pudo identificar el pedido de origen.');
  const tenantResult = await getTenant(validation.value.tenantSlug);
  if (!tenantResult.tenant) return commandError(tenantResult.error);
  const preflight = await validateAccountPreflight(tenantResult.tenant.id, validation.value);
  if (preflight.error || Object.keys(preflight.fieldErrors).length > 0) {
    return commandError(preflight.error ?? 'Hay campos que necesitan revision.', preflight.fieldErrors);
  }

  const { data, error } = await supabaseServer
    .from('customer_accounts')
    .insert({
      tenant_id: tenantResult.tenant.id,
      ...toAccountWritePayload(validation.value),
      commercial_terms: normalizeOptionalText(input.notes),
      metadata_json: {
        source: 'sales_order',
        source_order_id: sourceOrderId,
      },
    })
    .select('id, updated_at')
    .single();
  if (error || !data) return commandError(error?.message ?? 'No se pudo crear la Account.');
  revalidateAccountPaths(data.id);
  return commandSuccess('Account creada desde pedido.', 1, data.updated_at, data.id);
}

export async function rollbackAccountCreatedFromSalesOrder(input: {
  tenantSlug: string;
  accountId: string;
  sourceOrderId: string;
}) {
  const tenantResult = await getTenant(input.tenantSlug.trim());
  if (!tenantResult.tenant) return false;
  const { error } = await supabaseServer
    .from('customer_accounts')
    .delete()
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('id', input.accountId)
    .contains('metadata_json', { source: 'sales_order', source_order_id: input.sourceOrderId });
  return !error;
}

export async function updateAccount(input: UpdateAccountInput): Promise<AccountCommandResult> {
  const validation = validateUpdateAccountInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }

  const tenantResult = await getTenant(validation.value.tenantSlug);

  if (!tenantResult.tenant) {
    return commandError(tenantResult.error);
  }

  const accountExists = await getExistingAccount(tenantResult.tenant.id, validation.value.accountId ?? '');

  if (!accountExists.exists) {
    return commandError(accountExists.error, {
      accountId: accountExists.error ?? 'No se encontro la account solicitada.',
    });
  }

  const preflight = await validateAccountPreflight(tenantResult.tenant.id, validation.value);

  if (preflight.error || Object.keys(preflight.fieldErrors).length > 0) {
    return commandError(preflight.error ?? 'Hay campos que necesitan revision.', preflight.fieldErrors);
  }

  const { data, error } = await supabaseServer
    .from('customer_accounts')
    .update(toAccountWritePayload(validation.value))
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('id', validation.value.accountId)
    .select('updated_at')
    .single();

  if (error) {
    return commandError(error.message);
  }

  revalidateAccountPaths(validation.value.accountId);

  return commandSuccess('Account actualizada.', 1, data?.updated_at, validation.value.accountId);
}

export async function updatePriceList(
  input: UpdateAccountPriceListInput,
): Promise<AccountCommandResult> {
  const validation = validateUpdateAccountPriceListInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }

  const tenantResult = await getTenant(validation.value.tenantSlug);

  if (!tenantResult.tenant) {
    return commandError(tenantResult.error);
  }

  const [accountExists, priceListExists] = await Promise.all([
    getExistingAccount(tenantResult.tenant.id, validation.value.accountId),
    validation.value.priceListId
      ? priceListBelongsToTenant(tenantResult.tenant.id, validation.value.priceListId)
      : Promise.resolve(true),
  ]);

  if (!accountExists.exists) {
    return commandError(accountExists.error, {
      accountId: accountExists.error ?? 'No se encontro la account solicitada.',
    });
  }

  if (!priceListExists) {
    return commandError('Hay campos que necesitan revision.', {
      priceListId: 'La lista de precios seleccionada no pertenece al tenant.',
    });
  }

  const { data, error } = await supabaseServer
    .from('customer_accounts')
    .update({ price_list_id: validation.value.priceListId })
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('id', validation.value.accountId)
    .select('updated_at')
    .single();

  if (error) {
    return commandError(error.message);
  }

  revalidateAccountPaths(validation.value.accountId);

  return commandSuccess('Lista de precios actualizada.', 1, data?.updated_at, validation.value.accountId);
}

export async function updateStatus(input: UpdateAccountStatusInput): Promise<AccountCommandResult> {
  const validation = validateUpdateAccountStatusInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }

  const tenantResult = await getTenant(validation.value.tenantSlug);

  if (!tenantResult.tenant) {
    return commandError(tenantResult.error);
  }

  const accountExists = await getExistingAccount(tenantResult.tenant.id, validation.value.accountId);

  if (!accountExists.exists) {
    return commandError(accountExists.error, {
      accountId: accountExists.error ?? 'No se encontro la account solicitada.',
    });
  }

  const { data, error } = await supabaseServer
    .from('customer_accounts')
    .update({ status: validation.value.isActive ? 'active' : 'inactive' })
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('id', validation.value.accountId)
    .select('updated_at')
    .single();

  if (error) {
    return commandError(error.message);
  }

  revalidateAccountPaths(validation.value.accountId);

  return commandSuccess('Estado actualizado.', 1, data?.updated_at, validation.value.accountId);
}

async function validateAccountPreflight(tenantId: string, input: NormalizedAccountInput) {
  const fieldErrors: AccountCommandFieldErrors = {};

  if (input.priceListId) {
    const exists = await priceListBelongsToTenant(tenantId, input.priceListId);

    if (!exists) {
      fieldErrors.priceListId = 'La lista de precios seleccionada no pertenece al tenant.';
    }
  }

  return {
    fieldErrors,
    error: null,
  };
}

function toAccountWritePayload(input: NormalizedAccountInput) {
  return {
    name: input.name,
    legal_name: input.legalName,
    tax_id: input.taxId,
    whatsapp_phone: input.whatsapp,
    phone: input.whatsapp,
    email: input.email,
    address: input.address,
    price_list_id: input.priceListId,
    discount_percent: input.discountPercent,
    status: input.isActive ? 'active' : 'inactive',
  };
}

async function getTenant(tenantSlug: string): Promise<{
  tenant: TenantRecord | null;
  error: string | null;
}> {
  const result = await getTenantIdentity(tenantSlug);

  if (result.error || !result.tenant) {
    return {
      tenant: null,
      error: result.error,
    };
  }

  return {
    tenant: result.tenant,
    error: null,
  };
}

async function getExistingAccount(tenantId: string, accountId: string) {
  const { data, error } = await supabaseServer
    .from('customer_accounts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', accountId)
    .maybeSingle();

  if (error) {
    return {
      exists: false,
      error: error.message,
    };
  }

  return {
    exists: Boolean(data),
    error: data ? null : 'No se encontro la account solicitada.',
  };
}

async function priceListBelongsToTenant(tenantId: string, priceListId: string) {
  const { data, error } = await supabaseServer
    .from('price_lists')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', priceListId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data);
}

function commandSuccess(
  message: string,
  affected: number,
  updatedAt?: string,
  accountId?: string,
): AccountCommandResult {
  return {
    ok: true,
    affected,
    message,
    error: null,
    fieldErrors: {},
    updatedAt,
    accountId,
  };
}

function commandError(
  error: string | null,
  fieldErrors: AccountCommandFieldErrors = {},
): AccountCommandResult {
  return {
    ok: false,
    affected: 0,
    message: null,
    error: error ?? 'No se pudo completar la operacion.',
    fieldErrors,
  };
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function revalidateAccountPaths(accountId?: string) {
  const paths = ['/admin/accounts', '/admin'];

  if (accountId) {
    paths.push(`/admin/accounts/${accountId}`);
  }

  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      // Server actions provide the static generation store; scripts/tests do not.
    }
  }
}
