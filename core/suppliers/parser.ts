import { createHash } from 'node:crypto';
import readXlsxFile from 'read-excel-file/node';
import type {
  ParsedSupplierSource,
  SupplierPriceType,
  SupplierSourceDefinition,
  SupplierSourceIssue,
  SupplierSourceRow,
} from './types';

const MAX_ROWS = 100_000;
const MAX_COLUMNS = 256;
const MAX_XLSX_ENTRIES = 2_000;
const MAX_XLSX_UNCOMPRESSED_BYTES = 75 * 1024 * 1024;
const MAX_XLSX_EXPANSION_RATIO = 100;

type ColumnMap = { sku: number; name: number; presentation: number | null; price: number };

export async function parseSupplierDocument(input: {
  content: Uint8Array;
  contentType: string | null;
  source: SupplierSourceDefinition;
  sourceHttpLastModified?: string | null;
  fetchedAt?: string;
}): Promise<ParsedSupplierSource> {
  if (input.content.byteLength === 0) throw new Error('SOURCE_EMPTY: el documento esta vacio.');
  if (looksLikeHtml(input.content)) throw new Error('SOURCE_HTML: se recibio HTML/login en lugar de una lista.');

  const xlsx = isZip(input.content);
  const contentType = (input.contentType ?? '').split(';', 1)[0].trim().toLowerCase();
  if (!xlsx && contentType && !isAcceptedTextContentType(contentType)) {
    throw new Error(`SOURCE_CONTENT_TYPE: tipo inesperado ${contentType}.`);
  }
  if (xlsx && contentType && !isAcceptedXlsxContentType(contentType)) {
    throw new Error(`SOURCE_CONTENT_TYPE: un XLSX fue declarado como ${contentType}.`);
  }

  let rows: unknown[][];
  if (xlsx) {
    validateXlsxContainer(input.content);
    try {
      const sheets = await readXlsxFile(Buffer.from(input.content));
      if (!sheets[0]) throw new Error('La fuente no contiene hojas.');
      rows = sheets[0].data as unknown[][];
    } catch (error) {
      throw new Error(`SOURCE_XLSX_CORRUPT: ${errorMessage(error)}`);
    }
  } else {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(input.content).replace(/^\uFEFF/, '');
    rows = parseCsv(text);
  }

  return parseSupplierRows({
    rows,
    priceType: input.source.priceType,
    expectedListNumber: input.source.expectedListNumber,
    sourceUrl: input.source.url,
    contentFingerprint: createHash('sha256').update(input.content).digest('hex'),
    sourceHttpLastModified: input.sourceHttpLastModified ?? null,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
  });
}

export function parseSupplierRows(input: {
  rows: unknown[][];
  priceType: SupplierPriceType;
  expectedListNumber?: 1 | 2 | 3 | 4;
  sourceUrl?: string;
  contentFingerprint?: string | null;
  sourceHttpLastModified?: string | null;
  fetchedAt?: string;
}): ParsedSupplierSource {
  if (input.rows.length > MAX_ROWS) throw new Error(`SOURCE_TOO_MANY_ROWS: supera ${MAX_ROWS} filas.`);
  if (input.rows.some((row) => row.length > MAX_COLUMNS)) throw new Error(`SOURCE_TOO_MANY_COLUMNS: supera ${MAX_COLUMNS} columnas.`);
  const expectedListNumber = input.expectedListNumber ?? listNumberFor(input.priceType);
  const detectedListNumber = detectListNumber(input.rows);
  const sourceEmissionDate = detectEmissionDate(input.rows);
  const headerIndex = input.rows.findIndex((row) => detectColumns(row) !== null);
  if (headerIndex < 0) throw new Error('SOURCE_HEADER_MISSING: no se encontraron Codigo, Denominacion y Precio c/IVA.');
  const columns = detectColumns(input.rows[headerIndex]);
  if (!columns) throw new Error('SOURCE_HEADER_INVALID: cabecera invalida.');

  const candidates: SupplierSourceRow[] = [];
  const issues: SupplierSourceIssue[] = [];
  let dataRows = 0;
  let invalidRows = 0;
  for (let index = headerIndex + 1; index < input.rows.length; index += 1) {
    const row = input.rows[index] ?? [];
    const supplierSku = normalizeSupplierSku(row[columns.sku]);
    const nameRaw = cleanText(row[columns.name]);
    const priceText = cleanText(row[columns.price]);
    if (!supplierSku && !nameRaw && !priceText) continue;
    if (!supplierSku && nameRaw && !priceText) continue; // category/subtitle
    dataRows += 1;
    const raw = rawRow(input.rows[headerIndex], row, index + 1);
    const price = parseSupplierPrice(row[columns.price]);
    if (!supplierSku || !nameRaw || price === null) {
      invalidRows += 1;
      issues.push(issue(input.priceType, 'INVALID_PRODUCT_ROW', false, `Fila ${index + 1}: codigo, denominacion o precio invalido.`, supplierSku || undefined, raw));
      continue;
    }
    const presentationRaw = columns.presentation === null ? null : cleanText(row[columns.presentation]) || null;
    candidates.push({
      rowNumber: index + 1,
      supplierSku,
      nameRaw,
      presentationRaw,
      normalizedName: normalizeSupplierName(nameRaw),
      normalizedPresentation: normalizePresentation(presentationRaw),
      price,
      raw,
    });
  }

  const counts = new Map<string, number>();
  for (const row of candidates) counts.set(row.supplierSku, (counts.get(row.supplierSku) ?? 0) + 1);
  let duplicateRows = 0;
  const reported = new Set<string>();
  const products = candidates.filter((row) => {
    const count = counts.get(row.supplierSku) ?? 0;
    if (count === 1) return true;
    duplicateRows += 1;
    if (!reported.has(row.supplierSku)) {
      reported.add(row.supplierSku);
      issues.push(issue(input.priceType, 'DUPLICATE_SUPPLIER_SKU', true, `El codigo ${row.supplierSku} aparece ${count} veces y fue excluido.`, row.supplierSku, row.raw));
    }
    return false;
  });

  if (detectedListNumber === null) {
    issues.push(issue(input.priceType, 'SOURCE_IDENTITY_NOT_FOUND', true, `No se encontro "Precio de Lista ${expectedListNumber}"; la identidad de la fuente es obligatoria.`));
  } else if (detectedListNumber !== expectedListNumber) {
    issues.push(issue(input.priceType, 'SOURCE_IDENTITY_MISMATCH', true, `Se esperaba Lista ${expectedListNumber}, pero el contenido identifica Lista ${detectedListNumber}.`));
  }
  if (!sourceEmissionDate) {
    issues.push(issue(input.priceType, 'SOURCE_EMISSION_DATE_MISSING', false, 'No se encontro una Fecha de Emision interpretable.'));
  }

  const blocking = issues.some((item) => item.blocking);
  const warnings = issues.some((item) => !item.blocking);
  return {
    priceType: input.priceType,
    expectedListNumber,
    detectedListNumber,
    sourceUrl: input.sourceUrl ?? 'fixture',
    contentFingerprint: input.contentFingerprint ?? null,
    sourceEmissionDate,
    sourceHttpLastModified: input.sourceHttpLastModified ?? null,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    rowsRead: dataRows,
    validRows: products.length,
    invalidRows,
    duplicateRows,
    uniqueCodes: products.length,
    products,
    issues,
    readable: true,
    integrityStatus: blocking ? 'blocking' : warnings ? 'warning' : 'ok',
  };
}

export function normalizeSupplierSku(value: unknown) {
  return cleanText(value).replace(/\s+/g, '').toUpperCase();
}

export function normalizeSupplierName(value: unknown) {
  return cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function normalizePresentation(value: unknown): string | null {
  const original = cleanText(value);
  if (!original) return null;
  let normalized = normalizeSupplierName(original)
    .replace(/(\d)\s*c\s*c\b/g, '$1 ml')
    .replace(/(\d)\s*ml\b/g, '$1 ml')
    .replace(/(\d)\s*litros?\b/g, '$1 l')
    .replace(/(\d)\s*lts?\b/g, '$1 l')
    .replace(/\s+/g, ' ')
    .trim();
  const cc = normalized.match(/^(\d+(?:[.,]\d+)?)\s*cc$/);
  if (cc) normalized = `${cc[1].replace(',', '.')} ml`;
  return normalized || null;
}

export function parseSupplierPrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = cleanText(value).replace(/[$\s]/g, '');
  if (!text) return null;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) text = comma > dot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  else if (comma >= 0) text = text.length - comma - 1 === 3 ? text.replace(/,/g, '') : text.replace(',', '.');
  else if (dot >= 0 && text.length - dot - 1 === 3) text = text.replace(/\./g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCsv(text: string): string[][] {
  if (text.includes('\0')) throw new Error('SOURCE_CSV_CORRUPT: contiene bytes NUL.');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); rows.push(row); row = []; field = '';
      if (rows.length > MAX_ROWS) throw new Error(`SOURCE_TOO_MANY_ROWS: supera ${MAX_ROWS} filas.`);
    } else field += char;
  }
  if (quoted) throw new Error('SOURCE_CSV_CORRUPT: comillas sin cerrar.');
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows.some((item) => item.length > MAX_COLUMNS)) throw new Error(`SOURCE_TOO_MANY_COLUMNS: supera ${MAX_COLUMNS} columnas.`);
  return rows;
}

function detectColumns(row: unknown[]): ColumnMap | null {
  const normalized = row.map(normalizeHeader);
  const sku = normalized.findIndex((value) => ['codigo', 'cod', 'sku'].includes(value));
  const name = normalized.findIndex((value) => ['denominacion', 'producto', 'descripcion'].includes(value));
  const presentationIndex = normalized.findIndex((value) => ['presentacion', 'unidad'].includes(value));
  const price = normalized.findIndex((value) => value === 'precio c iva' || value === 'precio con iva' || value === 'precio');
  return sku >= 0 && name >= 0 && price >= 0 ? { sku, name, presentation: presentationIndex >= 0 ? presentationIndex : null, price } : null;
}

function detectListNumber(rows: unknown[][]) {
  for (const row of rows.slice(0, 40)) for (const cell of row) {
    const match = normalizeSupplierName(cell).match(/precio de lista\s*(\d+)/);
    if (match) return Number(match[1]);
  }
  return null;
}

function detectEmissionDate(rows: unknown[][]): string | null {
  for (const row of rows.slice(0, 40)) {
    for (let index = 0; index < row.length; index += 1) {
      const text = cleanText(row[index]);
      if (!normalizeSupplierName(text).includes('fecha de emision')) continue;
      const inline = text.match(/fecha\s+de\s+emisi[oó]n\s*:?\s*(.+)$/i)?.[1];
      const date = parseCommercialDate(inline || row[index + 1]);
      if (date) return date;
    }
  }
  return null;
}

function parseCommercialDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = cleanText(value);
  const local = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (local) {
    const year = local[3].length === 2 ? 2000 + Number(local[3]) : Number(local[3]);
    const date = new Date(Date.UTC(year, Number(local[2]) - 1, Number(local[1])));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === Number(local[2]) - 1 && date.getUTCDate() === Number(local[1])) return date.toISOString().slice(0, 10);
  }
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  return null;
}

function validateXlsxContainer(content: Uint8Array) {
  const view = new DataView(content.buffer, content.byteOffset, content.byteLength);
  let entries = 0; let compressed = 0; let uncompressed = 0; let centralDirectoryFound = false;
  for (let offset = 0; offset + 46 <= content.byteLength;) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50) {
      centralDirectoryFound = true; entries += 1;
      compressed += view.getUint32(offset + 20, true); uncompressed += view.getUint32(offset + 24, true);
      const length = 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
      offset += length;
    } else offset += 1;
  }
  if (!centralDirectoryFound) throw new Error('SOURCE_XLSX_CORRUPT: ZIP sin directorio central.');
  if (entries > MAX_XLSX_ENTRIES || uncompressed > MAX_XLSX_UNCOMPRESSED_BYTES || (compressed > 0 && uncompressed / compressed > MAX_XLSX_EXPANSION_RATIO)) {
    throw new Error('SOURCE_XLSX_EXPANSION_LIMIT: el contenido expandido excede los limites seguros.');
  }
}

function looksLikeHtml(content: Uint8Array) {
  const prefix = new TextDecoder().decode(content.slice(0, 1024)).trim().toLowerCase();
  return prefix.startsWith('<!doctype html') || prefix.startsWith('<html') || /<title[^>]*>.*(?:login|sign in|google)/s.test(prefix);
}
function isZip(content: Uint8Array) { return content[0] === 0x50 && content[1] === 0x4b && [0x03, 0x05, 0x07].includes(content[2]); }
function isAcceptedTextContentType(value: string) { return value === 'text/csv' || value === 'text/plain' || value === 'application/csv' || value === 'application/octet-stream'; }
function isAcceptedXlsxContentType(value: string) { return value === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || value === 'application/octet-stream'; }
function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/, 8).join('\n');
  const candidates = [',', ';', '\t'] as const;
  return candidates.map((value) => ({ value, count: sample.split(value).length - 1 })).sort((a, b) => b.count - a.count)[0].value;
}
function normalizeHeader(value: unknown) { return normalizeSupplierName(value).replace(/\biva incluido\b/g, 'c iva'); }
function cleanText(value: unknown) { return value === null || value === undefined ? '' : String(value).trim(); }
function rawRow(headers: unknown[], row: unknown[], rowNumber: number) {
  const result: Record<string, unknown> = { rowNumber };
  for (let index = 0; index < Math.max(headers.length, row.length); index += 1) result[cleanText(headers[index]) || `column_${index + 1}`] = serializable(row[index]);
  return result;
}
function serializable(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return value instanceof Date ? value.toISOString() : String(value);
}
function issue(priceType: SupplierPriceType, type: string, blocking: boolean, message: string, supplierSku?: string, raw?: Record<string, unknown>): SupplierSourceIssue {
  return { type, severity: blocking ? 'error' : 'warning', blocking, message, priceType, supplierSku, raw };
}
function listNumberFor(type: SupplierPriceType): 1 | 2 | 3 | 4 { return (SUPPLIER_LIST_NUMBER[type]); }
const SUPPLIER_LIST_NUMBER: Record<SupplierPriceType, 1 | 2 | 3 | 4> = { retail: 1, wholesale: 2, business: 3, cost: 4 };
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
