'use server';

import { revalidatePath } from 'next/cache';
import { writeAuditLog } from '@/lib/audit';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { supabaseServer } from '@/lib/supabaseServer';
import { applyExecutionCounts, buildImportReport, isControlledPlaceholderBrand, parseWorkbookBuffer, slugifyImportValue, zeroImportCounts } from './mapper';
import { getImportContext } from './queries';
import { validateImportFileMetadata, validateWorkbookAgainstState } from './validators';
import type {
  ExistingImportState,
  ImportCommandResult,
  ImportExecutionCounts,
  ImportReport,
  ImportRowStatus,
  ImportSheetName,
  ImportTenant,
  SheetRow,
  ValidatedWorkbook,
} from './types';

type PreparedImport = {
  tenant: ImportTenant;
  existing: ExistingImportState;
  parsed: ValidatedWorkbook;
  report: ImportReport;
};

export async function previewCatalogImport(formData: FormData): Promise<ImportCommandResult> {
  const upload = await readWebUpload(formData);
  if (!upload.ok) return commandError('preview', upload.error);
  const tenantSlug = await getCurrentTenantSlug();
  return previewCatalogImportFromBuffer(upload.buffer, upload.fileName, tenantSlug);
}

export async function confirmCatalogImport(formData: FormData): Promise<ImportCommandResult> {
  const upload = await readWebUpload(formData);
  if (!upload.ok) return commandError('failed', upload.error);
  const tenantSlug = await getCurrentTenantSlug();
  return executeCatalogImportFromBuffer(upload.buffer, upload.fileName, tenantSlug);
}

export async function previewCatalogImportFromBuffer(
  buffer: Uint8Array,
  sourceFile: string,
  tenantSlug: string,
): Promise<ImportCommandResult> {
  const prepared = await prepareImport(buffer, sourceFile, tenantSlug, 'preview');
  if (!prepared.ok) return prepared.result;
  const { report } = prepared.value;
  return {
    ok: !report.blocked,
    stage: 'preview',
    report,
    batchId: null,
    message: report.blocked
      ? null
      : 'Validacion completada. El archivo esta listo para importar.',
    error: report.blocked
      ? `La importacion esta bloqueada por ${report.errors.length} errores de validacion.`
      : null,
    warning: null,
  };
}

export async function executeCatalogImportFromBuffer(
  buffer: Uint8Array,
  sourceFile: string,
  tenantSlug: string,
): Promise<ImportCommandResult> {
  const prepared = await prepareImport(buffer, sourceFile, tenantSlug, 'import');
  if (!prepared.ok) return prepared.result;
  const { tenant, existing, parsed, report } = prepared.value;
  if (report.blocked) {
    return {
      ok: false,
      stage: 'failed',
      report,
      batchId: null,
      message: null,
      error: `La importacion esta bloqueada por ${report.errors.length} errores de validacion.`,
      warning: null,
    };
  }

  const batchResult = await createImportBatch(tenant.id, report.sourceFile);
  if (!batchResult.id) return commandError('failed', batchResult.error ?? 'No se pudo crear import_batch.', report);
  const counts: ImportExecutionCounts = { created: zeroImportCounts(), updated: zeroImportCounts() };

  try {
    await executeImport(tenant, batchResult.id, parsed, existing, counts);
    applyExecutionCounts(report, counts.created, counts.updated);
    const closeError = await updateImportBatch(batchResult.id, 'completed', report);
    if (closeError) throw new Error(closeError);
    const audit = await writeAuditLog({
      tenantId: tenant.id,
      entityType: 'import_batch',
      entityId: batchResult.id,
      action: 'catalog.import_completed',
      after: report.stats,
      metadata: { sourceFile: report.sourceFile, batchId: batchResult.id },
    });
    revalidateImportPaths();
    return {
      ok: true,
      stage: 'completed',
      report,
      batchId: batchResult.id,
      message: 'Catalogo importado correctamente.',
      error: null,
      warning: audit.error ? `La importacion termino, pero fallo la auditoria: ${audit.error}` : null,
    };
  } catch (error) {
    applyExecutionCounts(report, counts.created, counts.updated);
    report.blocked = true;
    report.fatalError = normalizeImportError(error);
    const batchWarning = await updateImportBatch(batchResult.id, 'failed', report);
    const audit = await writeAuditLog({
      tenantId: tenant.id,
      entityType: 'import_batch',
      entityId: batchResult.id,
      action: 'catalog.import_failed',
      after: report.stats,
      metadata: { sourceFile: report.sourceFile, batchId: batchResult.id, error: report.fatalError },
    });
    revalidateImportPaths();
    return {
      ok: false,
      stage: 'failed',
      report,
      batchId: batchResult.id,
      message: null,
      error: report.fatalError,
      warning: [batchWarning ? `No se pudo cerrar el batch: ${batchWarning}` : null, audit.error ? `Fallo la auditoria: ${audit.error}` : null].filter(Boolean).join(' ') || null,
    };
  }
}

async function prepareImport(
  buffer: Uint8Array,
  sourceFile: string,
  tenantSlug: string,
  mode: 'preview' | 'import',
): Promise<{ ok: true; value: PreparedImport } | { ok: false; result: ImportCommandResult }> {
  const startedAt = new Date();
  let parsed: ValidatedWorkbook;
  try {
    parsed = await parseWorkbookBuffer(buffer);
  } catch (error) {
    return { ok: false, result: commandError(mode === 'preview' ? 'preview' : 'failed', `No se pudo leer el XLSX: ${normalizeImportError(error)}`) };
  }
  const context = await getImportContext(tenantSlug);
  if (!context.tenant || !context.existing) {
    return { ok: false, result: commandError(mode === 'preview' ? 'preview' : 'failed', context.error ?? 'No se pudo preparar el tenant.') };
  }
  validateWorkbookAgainstState(parsed, context.existing);
  const report = buildImportReport(mode, sourceFile, tenantSlug, startedAt, parsed, context.existing);
  return { ok: true, value: { tenant: context.tenant, existing: context.existing, parsed, report } };
}

async function executeImport(
  tenant: ImportTenant,
  batchId: string,
  parsed: ValidatedWorkbook,
  existing: ExistingImportState,
  counts: ImportExecutionCounts,
) {
  const categoryIds = new Map(existing.categoriesByExternalId);
  const brandIds = new Map(existing.brandsByExternalId);
  const productIds = new Map(existing.productsBySku);

  for (const category of parsed.categories) {
    const existed = categoryIds.has(category.externalId);
    const id = await runTrackedRow(tenant.id, batchId, 'Categorias', category.rowNumber, 'categories', category.raw, async () => {
      const { data, error } = await supabaseServer.from('categories').upsert({
        tenant_id: tenant.id,
        external_id: category.externalId,
        name: category.name,
        slug: slugifyImportValue(category.name),
        sort_order: category.sortOrder,
        is_active: category.isActive,
      }, { onConflict: 'tenant_id,external_id' }).select('id').single();
      if (error) throw new Error(error.message);
      return String(data.id);
    });
    categoryIds.set(category.externalId, id);
    incrementCount(counts, 'Categorias', existed);
  }

  for (const brand of parsed.brands) {
    const controlledPlaceholder = isControlledPlaceholderBrand(brand.name)
      ? existing.controlledBrandId
      : null;
    const existed = brandIds.has(brand.externalId) || Boolean(controlledPlaceholder);
    const id = await runTrackedRow(tenant.id, batchId, 'Marcas', brand.rowNumber, 'brands', brand.raw, async () => {
      if (controlledPlaceholder) {
        const { data, error } = await supabaseServer
          .from('brands')
          .update({
            external_id: brand.externalId,
            name: brand.name,
            slug: 'sin-marca',
            price_adjustment_percent: brand.priceAdjustmentPercent,
            is_controlled_placeholder: true,
            is_active: brand.isActive,
          })
          .eq('tenant_id', tenant.id)
          .eq('id', controlledPlaceholder)
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        return String(data.id);
      }
      const { data, error } = await supabaseServer.from('brands').upsert({
        tenant_id: tenant.id,
        external_id: brand.externalId,
        name: brand.name,
        slug: slugifyImportValue(brand.name),
        price_adjustment_percent: brand.priceAdjustmentPercent,
        is_controlled_placeholder: isControlledPlaceholderBrand(brand.name),
        is_active: brand.isActive,
      }, { onConflict: 'tenant_id,external_id' }).select('id').single();
      if (error) throw new Error(error.message);
      return String(data.id);
    });
    brandIds.set(brand.externalId, id);
    incrementCount(counts, 'Marcas', existed);
  }

  for (const product of parsed.products) {
    const existed = productIds.has(product.sku);
    const categoryId = categoryIds.get(product.categoryExternalId);
    const brandId = brandIds.get(product.brandExternalId);
    if (!categoryId || !brandId) throw new Error(`Productos fila ${product.rowNumber}: relaciones no resueltas.`);
    const id = await runTrackedRow(tenant.id, batchId, 'Productos', product.rowNumber, 'products', product.raw, async () => {
      const { data, error } = await supabaseServer.from('products').upsert({
        tenant_id: tenant.id,
        sku: product.sku,
        category_id: categoryId,
        brand_id: brandId,
        product_line: product.productLine,
        name: product.name,
        variant: product.variant,
        description: product.description,
        source_page: product.sourcePage,
        internal_notes: product.internalNotes,
        is_active: product.isActive,
      }, { onConflict: 'tenant_id,sku' }).select('id').single();
      if (error) throw new Error(error.message);
      return String(data.id);
    });
    productIds.set(product.sku, id);
    incrementCount(counts, 'Productos', existed);
  }

  for (const price of parsed.prices) {
    const productId = productIds.get(price.sku);
    const priceListId = existing.priceListsByCode.get(price.priceListCode);
    if (!productId || !priceListId) throw new Error(`Precios fila ${price.rowNumber}: relaciones no resueltas.`);
    const key = `${productId}:${priceListId}`;
    const existed = existing.pricesByProductAndList.has(key);
    await runTrackedRow(tenant.id, batchId, 'Precios', price.rowNumber, 'product_prices', price.raw, async () => {
      const { data, error } = await supabaseServer.from('product_prices').upsert({
        tenant_id: tenant.id,
        product_id: productId,
        price_list_id: priceListId,
        price: price.price,
        currency: price.currency,
        pricing_mode: 'manual',
        margin_percent_override: null,
        calculated_from_cost: false,
      }, { onConflict: 'product_id,price_list_id' }).select('id').single();
      if (error) throw new Error(error.message);
      return String(data.id);
    });
    incrementCount(counts, 'Precios', existed);
  }
}

async function runTrackedRow(
  tenantId: string,
  batchId: string,
  sheet: ImportSheetName,
  rowNumber: number,
  targetTable: string,
  raw: SheetRow,
  operation: () => Promise<string>,
) {
  const { data: importRow, error: createError } = await supabaseServer.from('import_rows').insert({
    tenant_id: tenantId,
    batch_id: batchId,
    sheet_name: sheet,
    row_number: rowNumber,
    target_table: targetTable,
    status: 'processing',
    raw_json: raw,
  }).select('id').single();
  if (createError) throw new Error(`${sheet} fila ${rowNumber}: no se pudo crear import_row: ${createError.message}`);

  try {
    const targetRecordId = await operation();
    await updateImportRow(String(importRow.id), 'success', targetRecordId, null);
    return targetRecordId;
  } catch (error) {
    const message = normalizeImportError(error);
    await updateImportRow(String(importRow.id), 'error', null, message);
    throw new Error(`${sheet} fila ${rowNumber}: ${message}`);
  }
}

async function updateImportRow(id: string, status: ImportRowStatus, targetRecordId: string | null, errorMessage: string | null) {
  const { error } = await supabaseServer.from('import_rows').update({
    status,
    target_record_id: targetRecordId,
    error_message: errorMessage,
  }).eq('id', id);
  if (error) throw new Error(`No se pudo actualizar import_row: ${error.message}`);
}

async function createImportBatch(tenantId: string, sourceName: string) {
  const { data, error } = await supabaseServer.from('import_batches').insert({
    tenant_id: tenantId,
    source_name: sourceName,
    status: 'processing',
    started_at: new Date().toISOString(),
  }).select('id').single();
  return { id: data?.id ? String(data.id) : null, error: error?.message ?? null };
}

async function updateImportBatch(batchId: string, status: 'completed' | 'failed', report: ImportReport) {
  const { error } = await supabaseServer.from('import_batches').update({
    status,
    finished_at: new Date().toISOString(),
    summary_json: report,
  }).eq('id', batchId);
  return error ? `No se pudo cerrar import_batch: ${error.message}` : null;
}

async function readWebUpload(formData: FormData): Promise<
  { ok: true; buffer: Uint8Array; fileName: string } | { ok: false; error: string }
> {
  const entry = formData.get('file');
  if (!(entry instanceof File)) return { ok: false, error: 'Selecciona un archivo XLSX.' };
  const metadataError = validateImportFileMetadata(entry.name, entry.size);
  if (metadataError) return { ok: false, error: metadataError };
  return { ok: true, buffer: new Uint8Array(await entry.arrayBuffer()), fileName: entry.name };
}

function incrementCount(counts: ImportExecutionCounts, sheet: ImportSheetName, existed: boolean) {
  if (existed) counts.updated[sheet] += 1;
  else counts.created[sheet] += 1;
}

function normalizeImportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/pricing_mode|margin_percent_override|calculated_from_cost/i.test(message)) {
    return 'Falta aplicar db/migrations/006_pricing_engine.sql en Supabase.';
  }
  return message;
}

function commandError(
  stage: ImportCommandResult['stage'],
  error: string,
  report: ImportReport | null = null,
): ImportCommandResult {
  return { ok: false, stage, report, batchId: null, message: null, error, warning: null };
}

function revalidateImportPaths() {
  for (const path of ['/admin/importador', '/admin/productos', '/admin/precios', '/catalogo', '/admin']) {
    try { revalidatePath(path); } catch { /* Available during server actions. */ }
  }
}
