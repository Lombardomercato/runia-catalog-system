import * as XLSX from 'xlsx';
import {
  IMPORT_SHEETS,
  type ExistingImportState,
  type ImportSheetName,
  type ImportValidationError,
  type SheetRow,
  type ValidatedWorkbook,
} from './types';

export const MAX_IMPORT_FILE_SIZE = 4 * 1024 * 1024;

export function validateImportFileMetadata(name: string, size: number) {
  if (!name.trim()) return 'Selecciona un archivo XLSX.';
  if (!name.toLowerCase().endsWith('.xlsx')) return 'El archivo debe tener extension .xlsx.';
  if (size <= 0) return 'El archivo esta vacio.';
  if (size > MAX_IMPORT_FILE_SIZE) return 'El archivo supera el limite de 4 MB.';
  return null;
}

export function parseAndValidateWorkbook(workbook: XLSX.WorkBook): ValidatedWorkbook {
  const errors: ImportValidationError[] = [];
  const rows = Object.fromEntries(
    IMPORT_SHEETS.map((sheet) => [sheet, readSheet(workbook, sheet, errors)]),
  ) as Record<ImportSheetName, SheetRow[]>;
  const categories = validateCategories(rows.Categorias, errors);
  const brands = validateBrands(rows.Marcas, errors);
  const products = validateProducts(
    rows.Productos,
    errors,
    new Set(categories.map((category) => category.externalId)),
    new Set(brands.map((brand) => brand.externalId)),
  );
  const prices = validatePrices(
    rows.Precios,
    errors,
    new Set(products.map((product) => product.sku)),
  );

  return {
    categories,
    brands,
    products,
    prices,
    errors,
    rowsRead: Object.fromEntries(
      IMPORT_SHEETS.map((sheet) => [sheet, rows[sheet].length]),
    ) as Record<ImportSheetName, number>,
  };
}

export function validateWorkbookAgainstState(
  workbook: ValidatedWorkbook,
  existing: ExistingImportState,
) {
  for (const price of workbook.prices) {
    if (!existing.priceListsByCode.has(price.priceListCode)) {
      addError(
        workbook.errors,
        'Precios',
        price.rowNumber,
        'lista_precio',
        'lista_precio no existe para el tenant',
        price.priceListName,
      );
    }
  }
}

function readSheet(
  workbook: XLSX.WorkBook,
  sheetName: ImportSheetName,
  errors: ImportValidationError[],
) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    addError(errors, sheetName, 1, 'hoja', `No existe la hoja obligatoria "${sheetName}".`, sheetName);
    return [];
  }
  return XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: null, raw: false });
}

function validateCategories(rows: SheetRow[], errors: ImportValidationError[]) {
  const seen = new Set<string>();
  const valid: ValidatedWorkbook['categories'] = [];
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const before = errors.length;
    const externalId = requiredField(row, 'id', 'Categorias', rowNumber, errors);
    const name = requiredField(row, 'nombre', 'Categorias', rowNumber, errors);
    const isActive = booleanField(row, 'activo', 'Categorias', rowNumber, errors);
    const sortOrder = numberField(row, 'orden', 'Categorias', rowNumber, errors, 0);
    if (externalId && seen.has(externalId)) addError(errors, 'Categorias', rowNumber, 'id', 'id duplicado en la hoja', externalId);
    if (externalId) seen.add(externalId);
    if (errors.length === before && externalId && name && isActive !== null && sortOrder !== null) {
      valid.push({ rowNumber, raw: row, externalId, name, sortOrder, isActive });
    }
  }
  return valid;
}

function validateBrands(rows: SheetRow[], errors: ImportValidationError[]) {
  const seen = new Set<string>();
  const valid: ValidatedWorkbook['brands'] = [];
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const before = errors.length;
    const externalId = requiredField(row, 'id', 'Marcas', rowNumber, errors);
    const name = requiredField(row, 'nombre', 'Marcas', rowNumber, errors);
    const isActive = booleanField(row, 'activo', 'Marcas', rowNumber, errors);
    const priceAdjustmentPercent = numberField(row, 'ajuste_porcentaje', 'Marcas', rowNumber, errors, 0);
    if (externalId && seen.has(externalId)) addError(errors, 'Marcas', rowNumber, 'id', 'id duplicado en la hoja', externalId);
    if (externalId) seen.add(externalId);
    if (errors.length === before && externalId && name && isActive !== null && priceAdjustmentPercent !== null) {
      valid.push({ rowNumber, raw: row, externalId, name, priceAdjustmentPercent, isActive });
    }
  }
  return valid;
}

function validateProducts(
  rows: SheetRow[],
  errors: ImportValidationError[],
  categoryIds: Set<string>,
  brandIds: Set<string>,
) {
  const seen = new Set<string>();
  const valid: ValidatedWorkbook['products'] = [];
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const before = errors.length;
    const sku = requiredField(row, 'sku', 'Productos', rowNumber, errors);
    const categoryExternalId = requiredField(row, 'categoria_id', 'Productos', rowNumber, errors);
    const brandExternalId = requiredField(row, 'marca_id', 'Productos', rowNumber, errors);
    const name = requiredField(row, 'producto', 'Productos', rowNumber, errors);
    const isActive = booleanField(row, 'activo', 'Productos', rowNumber, errors);
    if (sku && seen.has(sku)) addError(errors, 'Productos', rowNumber, 'sku', 'sku duplicado en la hoja', sku);
    if (sku) seen.add(sku);
    if (categoryExternalId && !categoryIds.has(categoryExternalId)) addError(errors, 'Productos', rowNumber, 'categoria_id', 'categoria_id no existe en Categorias', categoryExternalId);
    if (brandExternalId && !brandIds.has(brandExternalId)) addError(errors, 'Productos', rowNumber, 'marca_id', 'marca_id no existe en Marcas', brandExternalId);
    if (errors.length === before && sku && categoryExternalId && brandExternalId && name && isActive !== null) {
      valid.push({
        rowNumber,
        raw: row,
        sku,
        categoryExternalId,
        brandExternalId,
        productLine: nullableField(row, 'linea'),
        name,
        variant: nullableField(row, 'variante'),
        description: nullableField(row, 'descripcion'),
        sourcePage: nullableField(row, 'pagina_pdf'),
        internalNotes: nullableField(row, 'observaciones_importacion'),
        isActive,
      });
    }
  }
  return valid;
}

function validatePrices(rows: SheetRow[], errors: ImportValidationError[], productSkus: Set<string>) {
  const seen = new Set<string>();
  const valid: ValidatedWorkbook['prices'] = [];
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const before = errors.length;
    const sku = requiredField(row, 'sku', 'Precios', rowNumber, errors);
    const priceListName = requiredField(row, 'lista_precio', 'Precios', rowNumber, errors);
    const price = numberField(row, 'precio', 'Precios', rowNumber, errors);
    if (sku && !productSkus.has(sku)) addError(errors, 'Precios', rowNumber, 'sku', 'sku no existe en Productos', sku);
    if (price !== null && price < 0) addError(errors, 'Precios', rowNumber, 'precio', 'no puede ser negativo', row.precio);
    const priceListCode = priceListName ? slugify(priceListName) : '';
    const duplicateKey = `${sku}:${priceListCode}`;
    if (sku && priceListCode && seen.has(duplicateKey)) addError(errors, 'Precios', rowNumber, 'sku/lista_precio', 'precio duplicado para sku y lista_precio', duplicateKey);
    if (sku && priceListCode) seen.add(duplicateKey);
    if (errors.length === before && sku && priceListName && price !== null) {
      valid.push({ rowNumber, raw: row, sku, priceListName, priceListCode, price, currency: normalizeText(row.moneda) || 'ARS' });
    }
  }
  return valid;
}

function requiredField(row: SheetRow, field: string, sheet: ImportSheetName, rowNumber: number, errors: ImportValidationError[]) {
  const value = normalizeText(row[field]);
  if (!value) {
    addError(errors, sheet, rowNumber, field, 'campo obligatorio vacio', row[field]);
    return null;
  }
  return value;
}

function nullableField(row: SheetRow, field: string) {
  return normalizeText(row[field]) || null;
}

function booleanField(row: SheetRow, field: string, sheet: ImportSheetName, rowNumber: number, errors: ImportValidationError[]) {
  const value = normalizeText(row[field]).toUpperCase();
  if (!value) {
    addError(errors, sheet, rowNumber, field, 'campo obligatorio vacio', row[field]);
    return null;
  }
  if (value === 'SI') return true;
  if (value === 'NO') return false;
  addError(errors, sheet, rowNumber, field, 'debe ser SI o NO', row[field]);
  return null;
}

function numberField(row: SheetRow, field: string, sheet: ImportSheetName, rowNumber: number, errors: ImportValidationError[], fallback?: number) {
  const value = row[field];
  if ((value === null || value === undefined || value === '') && fallback !== undefined) return fallback;
  if (value === null || value === undefined || value === '') {
    addError(errors, sheet, rowNumber, field, 'numero obligatorio vacio', value);
    return null;
  }
  const parsed = Number(normalizeNumberText(value));
  if (!Number.isFinite(parsed)) {
    addError(errors, sheet, rowNumber, field, 'debe ser numerico', value);
    return null;
  }
  return parsed;
}

function normalizeNumberText(value: unknown) {
  const text = normalizeText(value).replace(/\$/g, '').replace(/\s/g, '');
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) return text.replace(/\./g, '').replace(',', '.');
  if (hasComma) return text.replace(',', '.');
  if (hasDot) {
    const [integerPart, decimalPart] = text.split('.');
    if (decimalPart?.length === 3 && integerPart.length <= 3) return text.replace(/\./g, '');
  }
  return text;
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function addError(errors: ImportValidationError[], sheet: ImportSheetName, rowNumber: number, field: string, error: string, value: unknown) {
  errors.push({ sheet, rowNumber, field, error, value: serializableValue(value) });
}

function serializableValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
