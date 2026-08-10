import type {
  ParsedSupplierSource,
  SupplierRunHandle,
  SupplierSourceDefinition,
  SupplierSyncPlan,
  SupplierSyncResult,
  SupplierSyncSnapshot,
} from './types';

export interface SupplierSourceLoader {
  load(source: SupplierSourceDefinition): Promise<ParsedSupplierSource>;
}

export interface SupplierSnapshotReader {
  loadSnapshot(input: { tenantSlug: string; supplierCode: string }): Promise<SupplierSyncSnapshot>;
}

export interface SupplierSyncWriter {
  openRun(input: {
    tenantSlug: string;
    supplierCode: string;
    supplierName: string;
    leaseSeconds: number;
  }): Promise<SupplierRunHandle>;
  applyRun(handle: SupplierRunHandle, plan: SupplierSyncPlan): Promise<Omit<SupplierSyncResult, 'mode' | 'report'>>;
  failRun(handle: SupplierRunHandle, message: string): Promise<void>;
}
