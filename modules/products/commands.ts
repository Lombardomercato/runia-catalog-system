'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabaseServer';
import { getTenantIdentity } from '@/modules/tenant/queries';
import { updateSingleProductPrice } from '@/modules/pricing/commands';
import {
  validateUpdateProductInput,
  validateUpdateProductPriceInput,
  validateUpdateProductStatusInput,
} from './validators';
import type {
  NormalizedUpdateProductInput,
  ProductBulkCommandInput,
  ProductCommandFieldErrors,
  ProductCommandResult,
  ProductPriceListCode,
  UpdateProductInput,
  UpdateProductPriceInput,
  UpdateProductStatusInput,
} from './types';

type TenantRecord = {
  id: string;
  slug: string;
};

type ExistingProductRecord = {
  id: string;
  sku: string;
  updated_at: string;
};

export async function updateProduct(input: UpdateProductInput): Promise<ProductCommandResult> {
  const validation = validateUpdateProductInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }

  const tenantResult = await getTenant(validation.value.tenantSlug);

  if (!tenantResult.tenant) {
    return commandError(tenantResult.error);
  }

  const productResult = await getExistingProduct(tenantResult.tenant.id, validation.value.productId);

  if (!productResult.product) {
    return commandError(productResult.error, {
      productId: productResult.error ?? 'No se encontro el producto solicitado.',
    });
  }

  const preflight = await validateProductUpdatePreflight(
    tenantResult.tenant.id,
    productResult.product,
    validation.value,
  );

  if (preflight.error || Object.keys(preflight.fieldErrors).length > 0) {
    return commandError(preflight.error ?? 'Hay campos que necesitan revision.', preflight.fieldErrors);
  }

  const productWrite = await writeProductFields(tenantResult.tenant.id, validation.value);

  if (!productWrite.ok) {
    return productWrite;
  }

  const minoristaWrite = await writeProductPrice(
    validation.value.tenantSlug,
    validation.value.productId,
    'minorista',
    validation.value.minoristaPrice,
  );

  if (!minoristaWrite.ok) {
    return minoristaWrite;
  }

  if (validation.value.shouldUpdateMayoristaPrice && validation.value.mayoristaPrice !== null) {
    const mayoristaWrite = await writeProductPrice(
      validation.value.tenantSlug,
      validation.value.productId,
      'mayorista',
      validation.value.mayoristaPrice,
    );

    if (!mayoristaWrite.ok) {
      return mayoristaWrite;
    }
  }

  revalidateProductPaths(validation.value.productId);

  return commandSuccess('Producto actualizado.', 1, productWrite.updatedAt);
}

export async function updateProductPrice(
  input: UpdateProductPriceInput,
): Promise<ProductCommandResult> {
  const validation = validateUpdateProductPriceInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }

  const tenantResult = await getTenant(validation.value.tenantSlug);

  if (!tenantResult.tenant) {
    return commandError(tenantResult.error);
  }

  const productResult = await getExistingProduct(tenantResult.tenant.id, validation.value.productId);

  if (!productResult.product) {
    return commandError(productResult.error, {
      productId: productResult.error ?? 'No se encontro el producto solicitado.',
    });
  }

  const writeResult = await writeProductPrice(
    validation.value.tenantSlug,
    validation.value.productId,
    validation.value.priceListCode,
    validation.value.price,
  );

  if (!writeResult.ok) {
    return writeResult;
  }

  revalidateProductPaths(validation.value.productId);

  return commandSuccess('Precio actualizado.', 1);
}

export async function updateProductStatus(
  input: UpdateProductStatusInput,
): Promise<ProductCommandResult> {
  const validation = validateUpdateProductStatusInput(input);

  if (!validation.value) {
    return commandError('Hay campos que necesitan revision.', validation.fieldErrors);
  }

  const tenantResult = await getTenant(validation.value.tenantSlug);

  if (!tenantResult.tenant) {
    return commandError(tenantResult.error);
  }

  const productResult = await getExistingProduct(tenantResult.tenant.id, validation.value.productId);

  if (!productResult.product) {
    return commandError(productResult.error, {
      productId: productResult.error ?? 'No se encontro el producto solicitado.',
    });
  }

  const { data, error } = await supabaseServer
    .from('products')
    .update({ is_active: validation.value.isActive })
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('id', validation.value.productId)
    .select('updated_at')
    .single();

  if (error) {
    return commandError(error.message, { isActive: 'No se pudo actualizar el estado.' });
  }

  revalidateProductPaths(validation.value.productId);

  return commandSuccess('Estado actualizado.', 1, data?.updated_at);
}

export async function executeProductBulkCommand(
  _input: ProductBulkCommandInput,
): Promise<ProductCommandResult> {
  return commandError('Las acciones masivas todavia no estan habilitadas.');
}

async function validateProductUpdatePreflight(
  tenantId: string,
  existingProduct: ExistingProductRecord,
  input: NormalizedUpdateProductInput,
) {
  const fieldErrors: ProductCommandFieldErrors = {};

  if (input.sku !== existingProduct.sku) {
    fieldErrors.sku = 'El SKU no se puede modificar.';
  }

  const [duplicateSku, categoryExists, brandExists] = await Promise.all([
    hasDuplicateSku(tenantId, input.productId, existingProduct.sku),
    relatedRecordExists('categories', tenantId, input.categoryId),
    relatedRecordExists('brands', tenantId, input.brandId),
  ]);

  if (duplicateSku.error) {
    return {
      fieldErrors,
      error: duplicateSku.error,
    };
  }

  if (duplicateSku.exists) {
    fieldErrors.sku = 'Ya existe otro producto con este SKU.';
  }

  if (!categoryExists) {
    fieldErrors.categoryId = 'La categoria seleccionada no existe o esta inactiva.';
  }

  if (!brandExists) {
    fieldErrors.brandId = 'La marca seleccionada no existe o esta inactiva.';
  }

  return {
    fieldErrors,
    error: null,
  };
}

async function writeProductFields(
  tenantId: string,
  input: NormalizedUpdateProductInput,
): Promise<ProductCommandResult> {
  const { data, error } = await supabaseServer
    .from('products')
    .update({
      name: input.name,
      product_line: input.productLine,
      brand_id: input.brandId,
      category_id: input.categoryId,
      variant: input.variant,
      description: input.description,
      is_active: input.isActive,
    })
    .eq('tenant_id', tenantId)
    .eq('id', input.productId)
    .select('updated_at')
    .single();

  if (error) {
    return commandError(error.message);
  }

  return commandSuccess('Producto actualizado.', 1, data?.updated_at);
}

async function writeProductPrice(
  tenantSlug: string,
  productId: string,
  priceListCode: ProductPriceListCode,
  price: number,
): Promise<ProductCommandResult> {
  const result = await updateSingleProductPrice({ tenantSlug, productId, priceListCode, price });
  if (result.ok) return commandSuccess('Precio actualizado.', 1);

  const field = priceListCode === 'mayorista' ? 'mayoristaPrice' : 'minoristaPrice';
  return commandError(result.error, { [field]: result.fieldErrors.price ?? result.error ?? '' });
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

async function getExistingProduct(
  tenantId: string,
  productId: string,
): Promise<{
  product: ExistingProductRecord | null;
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('products')
    .select('id, sku, updated_at')
    .eq('tenant_id', tenantId)
    .eq('id', productId)
    .single();

  if (error || !data) {
    return {
      product: null,
      error: 'No se encontro el producto solicitado.',
    };
  }

  return {
    product: data,
    error: null,
  };
}

async function hasDuplicateSku(tenantId: string, productId: string, sku: string) {
  const { data, error } = await supabaseServer
    .from('products')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('sku', sku)
    .neq('id', productId)
    .maybeSingle();

  return {
    exists: Boolean(data),
    error: error?.message ?? null,
  };
}

async function relatedRecordExists(
  table: 'categories' | 'brands',
  tenantId: string,
  recordId: string,
) {
  const { data, error } = await supabaseServer
    .from(table)
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', recordId)
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
): ProductCommandResult {
  return {
    ok: true,
    affected,
    message,
    error: null,
    fieldErrors: {},
    updatedAt,
  };
}

function commandError(
  error: string | null,
  fieldErrors: ProductCommandFieldErrors = {},
): ProductCommandResult {
  return {
    ok: false,
    affected: 0,
    message: null,
    error: error ?? 'No se pudo completar la operacion.',
    fieldErrors,
  };
}

function revalidateProductPaths(productId: string) {
  for (const path of ['/admin/productos', `/admin/productos/${productId}`, '/catalogo']) {
    try {
      revalidatePath(path);
    } catch {
      // Server actions provide the static generation store; scripts/tests do not.
    }
  }
}
