import 'server-only';

import type { SupplierSnapshotReader, SupplierSyncWriter } from '@/core/suppliers/interfaces';
import { paginateRange } from '@/core/suppliers/pagination';
import {
  SUPPLIER_PRICE_TYPES,
  type SupplierPriceType,
  type SupplierRunHandle,
  type SupplierSyncPlan,
  type SupplierSyncSnapshot,
} from '@/core/suppliers/types';
import { supabaseServer } from '@/lib/supabaseServer';

const SNAPSHOT_PAGE_SIZE = 500;

export class SupabaseSupplierSnapshotReader implements SupplierSnapshotReader {
  async loadSnapshot(input: { tenantSlug: string; supplierCode: string }): Promise<SupplierSyncSnapshot> {
    const { data: tenant, error: tenantError } = await supabaseServer.from('tenants').select('id').eq('slug', input.tenantSlug).maybeSingle();
    if (tenantError) throw new Error(tenantError.message);
    if (!tenant) return { available: true, products: [] };
    const { data: supplier, error: supplierError } = await supabaseServer.from('suppliers').select('id').eq('tenant_id', tenant.id).eq('code', input.supplierCode.trim().toLowerCase()).maybeSingle();
    if (supplierError) throw new Error(supplierError.message);
    if (!supplier) return { available: true, products: [] };

    const rows = await paginateRange(async (from, to) => {
      const { data, error } = await supabaseServer
        .from('supplier_products')
        .select('id, supplier_sku, name_raw, presentation_raw, normalized_name, normalized_presentation, last_seen_at, supplier_prices(price_type, current_price)')
        .eq('supplier_id', supplier.id)
        .order('id', { ascending: true })
        .range(from, to);
      if (error) throw new Error(error.message);
      return data ?? [];
    }, SNAPSHOT_PAGE_SIZE);
    return {
      available: true,
      products: rows.map((row) => ({
        id: String(row.id),
        supplierSku: String(row.supplier_sku),
        nameRaw: String(row.name_raw),
        presentationRaw: row.presentation_raw === null ? null : String(row.presentation_raw),
        normalizedName: String(row.normalized_name),
        normalizedPresentation: row.normalized_presentation === null ? null : String(row.normalized_presentation),
        lastSeenAt: String(row.last_seen_at),
        prices: mapPrices(row.supplier_prices),
      })),
    };
  }
}

export class SupabaseSupplierSyncWriter implements SupplierSyncWriter {
  async openRun(input: { tenantSlug: string; supplierCode: string; supplierName: string; leaseSeconds: number }): Promise<SupplierRunHandle> {
    const { data, error } = await supabaseServer.rpc('supplier_open_sync_run', {
      p_tenant_slug: input.tenantSlug,
      p_supplier_code: input.supplierCode,
      p_supplier_name: input.supplierName,
      p_lease_seconds: input.leaseSeconds,
    });
    if (error) throw new Error(error.message);
    const result = data as Record<string, unknown>;
    return { tenantId: String(result.tenantId), supplierId: String(result.supplierId), runId: String(result.runId) };
  }

  async applyRun(handle: SupplierRunHandle, plan: SupplierSyncPlan) {
    const { data, error } = await supabaseServer.rpc('supplier_apply_sync', {
      p_run_id: handle.runId,
      p_plan: {
        canApply: plan.canApply,
        status: plan.status,
        productsRead: plan.productsRead,
        warnings: plan.warnings,
        errors: plan.errors,
        sourceSummary: plan.sourceSummary,
        products: plan.products.map((product) => ({
          supplierSku: product.supplierSku,
          nameRaw: product.nameRaw,
          presentationRaw: product.presentationRaw,
          normalizedName: product.normalizedName,
          normalizedPresentation: product.normalizedPresentation,
          eligibilityStatus: product.eligibilityStatus,
          updateCanonicalMetadata: product.updateCanonicalMetadata,
          rawData: product.rawData,
          prices: product.prices.map((price) => ({
            priceType: price.priceType,
            action: price.action,
            newPrice: price.newPrice,
            sourceEmissionDate: price.sourceEmissionDate,
            sourceHttpLastModified: price.sourceHttpLastModified,
            fetchedAt: price.fetchedAt,
            rawData: price.rawData,
          })),
          candidatePrices: product.candidatePrices.map((price) => ({
            priceType: price.priceType,
            observedPrice: price.observedPrice,
            reason: price.reason,
            sourceEmissionDate: price.sourceEmissionDate,
            sourceHttpLastModified: price.sourceHttpLastModified,
            fetchedAt: price.fetchedAt,
            rawData: price.rawData,
          })),
        })),
        anomalies: plan.anomalies,
      },
    });
    if (error) throw new Error(error.message);
    const result = data as Record<string, unknown>;
    return {
      runId: handle.runId,
      supplierId: handle.supplierId,
      status: plan.status,
      productsRead: Number(result.productsRead ?? plan.productsRead),
      productsCreated: Number(result.productsCreated ?? 0),
      pricesUpdated: Number(result.pricesUpdated ?? 0),
      pricesUnchanged: Number(result.pricesUnchanged ?? 0),
      warnings: plan.warnings,
      errors: plan.errors,
      anomalies: plan.anomalies.length,
    };
  }

  async failRun(handle: SupplierRunHandle, message: string) {
    const { error } = await supabaseServer.from('supplier_sync_runs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: 1, error_message: message.slice(0, 2_000) }).eq('id', handle.runId).eq('status', 'running');
    if (error) throw new Error(error.message);
  }
}

function mapPrices(value: unknown): Partial<Record<SupplierPriceType, number>> {
  const result: Partial<Record<SupplierPriceType, number>> = {};
  if (!Array.isArray(value)) return result;
  for (const row of value) if (row && typeof row === 'object') {
    const item = row as Record<string, unknown>;
    const priceType = String(item.price_type) as SupplierPriceType;
    if (SUPPLIER_PRICE_TYPES.includes(priceType) && Number.isFinite(Number(item.current_price))) result[priceType] = Number(item.current_price);
  }
  return result;
}
