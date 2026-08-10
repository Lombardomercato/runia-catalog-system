import type { SupplierSnapshotReader, SupplierSourceLoader, SupplierSyncWriter } from './interfaces';
import { planSupplierSync } from './planner';
import {
  SUPPLIER_PRICE_TYPES,
  type ParsedSupplierSource,
  type SupplierDryRunReport,
  type SupplierGuardrails,
  type SupplierSourceDefinition,
  type SupplierSyncPlan,
  type SupplierSyncResult,
  type SupplierSyncSnapshot,
} from './types';

export class SyncSupplierPrices {
  constructor(
    private readonly sourceLoader: SupplierSourceLoader,
    private readonly snapshotReader?: SupplierSnapshotReader,
    private readonly writer?: SupplierSyncWriter,
  ) {}

  async execute(input: {
    dryRun: boolean;
    tenantSlug: string;
    supplierCode: string;
    supplierName: string;
    sources: SupplierSourceDefinition[];
    guardrails?: Partial<SupplierGuardrails>;
    leaseSeconds?: number;
    now?: Date;
    beforeWrite?: (plan: SupplierSyncPlan) => void | Promise<void>;
  }): Promise<SupplierDryRunReport | SupplierSyncResult> {
    validateInput(input);
    const now = input.now ?? new Date();
    const [sources, snapshot] = await Promise.all([
      Promise.all(input.sources.map((source) => this.loadSource(source, now))),
      this.readSnapshot(input, input.dryRun),
    ]);
    const plan = planSupplierSync({
      supplierCode: input.supplierCode,
      sources,
      sourceDefinitions: input.sources,
      snapshot,
      now,
      guardrails: input.guardrails,
    });
    if (input.dryRun) return plan.report;
    if (!this.writer) throw new Error('WRITE_REPOSITORY_REQUIRED: no se configuro persistencia.');
    if (!snapshot.available) throw new Error(`WRITE_SNAPSHOT_REQUIRED: ${snapshot.unavailableReason ?? 'snapshot no disponible'}`);
    if (!plan.canApply) throw new Error('WRITE_BLOCKED_BY_SOURCE_INTEGRITY: no se abrio run ni se escribio catalogo.');
    await input.beforeWrite?.(plan);

    // The first database write happens only after all four sources passed critical validation.
    const handle = await this.writer.openRun({
      tenantSlug: input.tenantSlug,
      supplierCode: input.supplierCode,
      supplierName: input.supplierName,
      leaseSeconds: input.leaseSeconds ?? 1_800,
    });
    try {
      const result = await this.writer.applyRun(handle, plan);
      return { ...result, mode: 'write', report: plan.report };
    } catch (error) {
      await this.writer.failRun(handle, errorMessage(error)).catch(() => undefined);
      throw error;
    }
  }

  private async readSnapshot(input: { tenantSlug: string; supplierCode: string }, dryRun: boolean): Promise<SupplierSyncSnapshot> {
    if (!this.snapshotReader) return { available: false, products: [], unavailableReason: 'Sin credenciales de lectura: comparaciones contra snapshot se muestran como N/D.' };
    try {
      return await this.snapshotReader.loadSnapshot(input);
    } catch (error) {
      if (!dryRun) throw error;
      return { available: false, products: [], unavailableReason: `Snapshot no disponible: ${errorMessage(error)}` };
    }
  }

  private async loadSource(source: SupplierSourceDefinition, now: Date): Promise<ParsedSupplierSource> {
    try {
      return await this.sourceLoader.load(source);
    } catch (error) {
      return failedSource(source, now, errorMessage(error));
    }
  }
}

function validateInput(input: { tenantSlug: string; supplierCode: string; supplierName: string; sources: SupplierSourceDefinition[]; leaseSeconds?: number }) {
  if (!input.tenantSlug.trim()) throw new Error('tenantSlug es obligatorio.');
  if (!input.supplierCode.trim()) throw new Error('supplierCode es obligatorio.');
  if (!input.supplierName.trim()) throw new Error('supplierName es obligatorio.');
  const byType = new Map(input.sources.map((source) => [source.priceType, source]));
  for (const type of SUPPLIER_PRICE_TYPES) if (!byType.get(type)?.url.trim()) throw new Error(`Falta la fuente ${type}.`);
  if (input.sources.length !== SUPPLIER_PRICE_TYPES.length || byType.size !== SUPPLIER_PRICE_TYPES.length) throw new Error('Se requieren exactamente las cuatro fuentes VINROS.');
  if (input.leaseSeconds !== undefined && (!Number.isInteger(input.leaseSeconds) || input.leaseSeconds < 60)) throw new Error('leaseSeconds debe ser un entero de al menos 60 segundos.');
}

function failedSource(source: SupplierSourceDefinition, now: Date, message: string): ParsedSupplierSource {
  return {
    priceType: source.priceType,
    expectedListNumber: source.expectedListNumber,
    detectedListNumber: null,
    sourceUrl: source.url,
    contentFingerprint: null,
    sourceEmissionDate: null,
    sourceHttpLastModified: null,
    fetchedAt: now.toISOString(),
    rowsRead: 0,
    validRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    uniqueCodes: 0,
    products: [],
    issues: [{ type: 'SOURCE_READ_ERROR', severity: 'error', blocking: true, message, priceType: source.priceType }],
    readable: false,
    integrityStatus: 'blocking',
  };
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
