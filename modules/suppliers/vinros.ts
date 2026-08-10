import { SyncSupplierPrices } from '@/core/suppliers/service';
import type { SupplierSnapshotReader, SupplierSourceLoader, SupplierSyncWriter } from '@/core/suppliers/interfaces';
import type { SupplierGuardrails, SupplierPriceType, SupplierSourceDefinition, SupplierSyncPlan } from '@/core/suppliers/types';
import { HttpSupplierSheetLoader } from './HttpSupplierSheetLoader';

const VINROS_LISTS: Array<{ priceType: SupplierPriceType; expectedListNumber: 1 | 2 | 3 | 4 }> = [
  { priceType: 'retail', expectedListNumber: 1 },
  { priceType: 'wholesale', expectedListNumber: 2 },
  { priceType: 'business', expectedListNumber: 3 },
  { priceType: 'cost', expectedListNumber: 4 },
];

export async function syncVinrosPrices(options: {
  dryRun: boolean;
  tenantSlug?: string;
  sourceUrls?: Record<SupplierPriceType, string>;
  baselines?: Partial<Record<SupplierPriceType, number | null>>;
  absoluteMinimumPrices?: Partial<Record<SupplierPriceType, number | null>>;
  guardrails?: Partial<SupplierGuardrails>;
  leaseSeconds?: number;
  now?: Date;
  beforeWrite?: (plan: SupplierSyncPlan) => void | Promise<void>;
  dependencies?: { loader?: SupplierSourceLoader; snapshotReader?: SupplierSnapshotReader; writer?: SupplierSyncWriter };
}) {
  const tenantSlug = options.tenantSlug ?? requiredEnv('VINROS_TENANT_SLUG');
  const sources = vinrosSourceDefinitions(options.sourceUrls, options.baselines, options.absoluteMinimumPrices);
  let snapshotReader = options.dependencies?.snapshotReader;
  let writer = options.dependencies?.writer;

  if (!snapshotReader && hasSupabaseReadCredentials()) {
    const repository = await import('./SupabaseSupplierSyncRepository');
    snapshotReader = new repository.SupabaseSupplierSnapshotReader();
  }
  if (!options.dryRun && !writer) {
    const repository = await import('./SupabaseSupplierSyncRepository');
    writer = new repository.SupabaseSupplierSyncWriter();
  }

  return new SyncSupplierPrices(options.dependencies?.loader ?? new HttpSupplierSheetLoader(), snapshotReader, writer).execute({
    dryRun: options.dryRun,
    tenantSlug,
    supplierCode: 'vinros',
    supplierName: 'VINROS',
    sources,
    now: options.now,
    beforeWrite: options.beforeWrite,
    leaseSeconds: options.leaseSeconds ?? optionalIntegerEnv('VINROS_RUN_LEASE_SECONDS') ?? 1_800,
    guardrails: {
      minimumProductsPerList: optionalIntegerEnv('VINROS_MINIMUM_PRODUCTS_PER_LIST') ?? 10,
      ...options.guardrails,
    },
  });
}

function vinrosSourceDefinitions(
  sourceUrls?: Record<SupplierPriceType, string>,
  baselines?: Partial<Record<SupplierPriceType, number | null>>,
  absoluteMinimumPrices?: Partial<Record<SupplierPriceType, number | null>>,
): SupplierSourceDefinition[] {
  return VINROS_LISTS.map(({ priceType, expectedListNumber }) => ({
    priceType,
    expectedListNumber,
    url: sourceUrls?.[priceType] ?? requiredEnv(`VINROS_LIST_${expectedListNumber}_URL`),
    approvedBaselineRows: baselines && priceType in baselines ? baselines[priceType] ?? null : optionalPositiveNumberEnv(`VINROS_LIST_${expectedListNumber}_BASELINE_ROWS`, true),
    absoluteMinimumPrice: absoluteMinimumPrices?.[priceType] ?? optionalPositiveNumberEnv(`VINROS_${priceType.toUpperCase()}_MIN_PRICE`, false),
  }));
}

function hasSupabaseReadCredentials() {
  return Boolean((process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
function requiredEnv(name: string) { const value = process.env[name]?.trim(); if (!value) throw new Error(`Falta la variable de entorno ${name}.`); return value; }
function optionalIntegerEnv(name: string) { const value = process.env[name]?.trim(); if (!value) return null; const number = Number(value); if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} debe ser un entero positivo.`); return number; }
function optionalPositiveNumberEnv(name: string, integer: boolean) { const value = process.env[name]?.trim(); if (!value) return null; const number = Number(value); if (!Number.isFinite(number) || number <= 0 || (integer && !Number.isInteger(number))) throw new Error(`${name} debe ser ${integer ? 'un entero' : 'un numero'} positivo.`); return number; }
