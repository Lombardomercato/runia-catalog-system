import * as XLSX from 'xlsx';
import { parseAndValidateWorkbook } from './validators';
import {
  IMPORT_SHEETS,
  type ExistingImportState,
  type ImportCountMap,
  type ImportHistoryItem,
  type ImportMode,
  type ImportReport,
  type ImportSheetName,
  type ImportSheetStats,
  type ValidatedWorkbook,
} from './types';

export function parseWorkbookBuffer(buffer: Uint8Array) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  return parseAndValidateWorkbook(workbook);
}

export function buildImportReport(
  mode: ImportMode,
  sourceFile: string,
  tenantSlug: string,
  startedAt: Date,
  parsed: ValidatedWorkbook,
  existing: ExistingImportState,
): ImportReport {
  const stats = Object.fromEntries(
    IMPORT_SHEETS.map((sheet) => [sheet, buildSheetStats(parsed, sheet)]),
  ) as Record<ImportSheetName, ImportSheetStats>;

  parsed.categories.forEach((row) => incrementPlan(stats.Categorias, existing.categoriesByExternalId.has(row.externalId)));
  parsed.brands.forEach((row) => incrementPlan(stats.Marcas, existing.brandsByExternalId.has(row.externalId)));
  parsed.products.forEach((row) => incrementPlan(stats.Productos, existing.productsBySku.has(row.sku)));
  parsed.prices.forEach((row) => {
    const productId = existing.productsBySku.get(row.sku);
    const listId = existing.priceListsByCode.get(row.priceListCode);
    incrementPlan(stats.Precios, Boolean(productId && listId && existing.pricesByProductAndList.has(`${productId}:${listId}`)));
  });

  return {
    mode,
    sourceFile: sanitizeSourceName(sourceFile),
    tenantSlug,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    blocked: parsed.errors.length > 0,
    stats,
    errors: parsed.errors,
  };
}

export function applyExecutionCounts(report: ImportReport, created: ImportCountMap, updated: ImportCountMap) {
  for (const sheet of IMPORT_SHEETS) {
    report.stats[sheet].toCreate = created[sheet];
    report.stats[sheet].toUpdate = updated[sheet];
  }
  report.finishedAt = new Date().toISOString();
  return report;
}

export function mapImportHistoryRow(row: Record<string, unknown>): ImportHistoryItem {
  const summary = isRecord(row.summary_json) ? row.summary_json : {};
  const stats = isRecord(summary.stats) ? summary.stats : {};
  let totalRows = 0;
  let errorCount = 0;
  let toCreate = 0;
  let toUpdate = 0;
  for (const sheet of IMPORT_SHEETS) {
    const sheetStats = isRecord(stats[sheet]) ? stats[sheet] : {};
    totalRows += toFiniteNumber(sheetStats.rowsRead);
    errorCount += toFiniteNumber(sheetStats.errors);
    toCreate += toFiniteNumber(sheetStats.toCreate);
    toUpdate += toFiniteNumber(sheetStats.toUpdate);
  }
  return {
    id: String(row.id),
    sourceName: String(row.source_name || 'Archivo XLSX'),
    status: String(row.status || 'pending'),
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    finishedAt: typeof row.finished_at === 'string' ? row.finished_at : null,
    createdAt: String(row.created_at),
    totalRows,
    errorCount,
    toCreate,
    toUpdate,
  };
}

export function zeroImportCounts(): ImportCountMap {
  return { Categorias: 0, Marcas: 0, Productos: 0, Precios: 0 };
}

export function slugifyImportValue(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function sanitizeSourceName(value: string) {
  return value.replace(/\\/g, '/').split('/').pop()?.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'catalogo.xlsx';
}

function buildSheetStats(parsed: ValidatedWorkbook, sheet: ImportSheetName) {
  const sheetErrors = parsed.errors.filter((error) => error.sheet === sheet);
  const invalidRows = new Set(sheetErrors.map((error) => error.rowNumber));
  return {
    rowsRead: parsed.rowsRead[sheet],
    rowsValid: Math.max(0, parsed.rowsRead[sheet] - invalidRows.size),
    errors: sheetErrors.length,
    toCreate: 0,
    toUpdate: 0,
  };
}

function incrementPlan(stats: ImportSheetStats, exists: boolean) {
  if (exists) stats.toUpdate += 1;
  else stats.toCreate += 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
