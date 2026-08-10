import { parseSupplierDocument } from '@/core/suppliers/parser';
import type { SupplierSourceLoader } from '@/core/suppliers/interfaces';
import type { SupplierSourceDefinition } from '@/core/suppliers/types';

const DEFAULT_MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export class HttpSupplierSheetLoader implements SupplierSourceLoader {
  constructor(private readonly options: { maxBytes?: number; timeoutMs?: number; now?: () => Date } = {}) {}

  async load(source: SupplierSourceDefinition) {
    const url = downloadableGoogleSheetUrl(source.url);
    const maxBytes = this.options.maxBytes ?? DEFAULT_MAX_SOURCE_BYTES;
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { accept: 'text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      });
      if (!response.ok) throw new Error(`SOURCE_HTTP_ERROR: ${source.priceType} respondio HTTP ${response.status}.`);
      const declaredLength = parseContentLength(response.headers.get('content-length'));
      if (declaredLength !== null && declaredLength > maxBytes) throw new Error(`SOURCE_TOO_LARGE: ${source.priceType} supera ${formatMb(maxBytes)} MB.`);
      const content = new Uint8Array(await response.arrayBuffer());
      if (content.byteLength > maxBytes) throw new Error(`SOURCE_TOO_LARGE: ${source.priceType} supera ${formatMb(maxBytes)} MB.`);
      return await parseSupplierDocument({
        content,
        contentType: response.headers.get('content-type'),
        source,
        sourceHttpLastModified: parseHttpDate(response.headers.get('last-modified')),
        fetchedAt: (this.options.now?.() ?? new Date()).toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error(`SOURCE_TIMEOUT: ${source.priceType} excedio ${timeoutMs / 1000} segundos.`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function downloadableGoogleSheetUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('SOURCE_URL_INVALID: la URL de proveedor no es valida.'); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('SOURCE_URL_INSECURE: las fuentes deben usar HTTPS.');
  if (url.hostname === 'docs.google.com') {
    const match = url.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
    if (match) {
      const gid = url.searchParams.get('gid') ?? url.hash.match(/gid=(\d+)/)?.[1];
      if (!gid || !/^\d+$/.test(gid)) throw new Error('SOURCE_GOOGLE_SHEET_GID_REQUIRED: la fuente debe identificar una pestaña mediante gid.');
      return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(match[1])}/export?format=csv&gid=${encodeURIComponent(gid)}`;
    }
  }
  return url.toString();
}

function parseHttpDate(value: string | null) { if (!value) return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); }
function parseContentLength(value: string | null) { if (!value) return null; const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null; }
function formatMb(bytes: number) { return Math.round(bytes / 1024 / 1024 * 100) / 100; }
