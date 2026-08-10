export const SUPPLIER_PRICE_TYPES = ['retail', 'wholesale', 'business', 'cost'] as const;

export type SupplierPriceType = (typeof SUPPLIER_PRICE_TYPES)[number];
export const SUPPLIER_PRODUCT_ELIGIBILITY_STATUSES = ['safe', 'blocked', 'pending_review', 'supplier_only_cost'] as const;

export type SupplierProductEligibilityStatus = (typeof SUPPLIER_PRODUCT_ELIGIBILITY_STATUSES)[number];
export type SupplierSyncStatus = 'running' | 'completed' | 'completed_with_warnings' | 'failed';
export type IntegrityStatus = 'ok' | 'warning' | 'blocking';

export type SupplierSourceDefinition = {
  priceType: SupplierPriceType;
  expectedListNumber: 1 | 2 | 3 | 4;
  url: string;
  approvedBaselineRows: number | null;
  absoluteMinimumPrice?: number | null;
};

export type SupplierSourceRow = {
  rowNumber: number;
  supplierSku: string;
  nameRaw: string;
  presentationRaw: string | null;
  normalizedName: string;
  normalizedPresentation: string | null;
  price: number;
  raw: Record<string, unknown>;
};

export type SupplierSourceIssue = {
  type: string;
  severity: 'warning' | 'error';
  blocking: boolean;
  message: string;
  priceType: SupplierPriceType;
  supplierSku?: string;
  raw?: Record<string, unknown>;
};

export type ParsedSupplierSource = {
  priceType: SupplierPriceType;
  expectedListNumber: 1 | 2 | 3 | 4;
  detectedListNumber: number | null;
  sourceUrl: string;
  contentFingerprint: string | null;
  sourceEmissionDate: string | null;
  sourceHttpLastModified: string | null;
  fetchedAt: string;
  rowsRead: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  uniqueCodes: number;
  products: SupplierSourceRow[];
  issues: SupplierSourceIssue[];
  readable: boolean;
  integrityStatus: IntegrityStatus;
};

export type SupplierProductSnapshot = {
  id: string;
  supplierSku: string;
  nameRaw: string;
  presentationRaw: string | null;
  normalizedName: string;
  normalizedPresentation: string | null;
  lastSeenAt: string;
  prices: Partial<Record<SupplierPriceType, number>>;
};

export type SupplierSyncSnapshot = {
  available: boolean;
  products: SupplierProductSnapshot[];
  unavailableReason?: string;
};

export type PlannedSupplierPrice = {
  priceType: SupplierPriceType;
  action: 'update' | 'unchanged';
  newPrice: number;
  sourceEmissionDate: string | null;
  sourceHttpLastModified: string | null;
  fetchedAt: string;
  rawData: Record<string, unknown>;
};

export type PlannedSupplierCandidatePrice = Omit<PlannedSupplierPrice, 'action' | 'newPrice'> & {
  observedPrice: number;
  reason: string;
};

export type PlannedSupplierProduct = {
  supplierSku: string;
  nameRaw: string;
  presentationRaw: string | null;
  normalizedName: string;
  normalizedPresentation: string | null;
  eligibilityStatus: SupplierProductEligibilityStatus;
  updateCanonicalMetadata: boolean;
  rawData: Record<string, unknown>;
  prices: PlannedSupplierPrice[];
  candidatePrices: PlannedSupplierCandidatePrice[];
};

export type PlannedSupplierAnomaly = {
  fingerprint: string;
  type: string;
  severity: 'info' | 'warning' | 'error';
  blocking: boolean;
  message: string;
  supplierSku: string | null;
  priceType: SupplierPriceType | null;
  oldPrice: number | null;
  observedPrice: number | null;
  rawData: Record<string, unknown>;
};

export type SupplierListReport = {
  priceType: SupplierPriceType;
  expectedListNumber: number;
  detectedListNumber: number | null;
  sourceEmissionDate: string | null;
  sourceHttpLastModified: string | null;
  fetchedAt: string;
  rowsTotal: number;
  rowsValid: number;
  rowsInvalid: number;
  uniqueCodes: number;
  duplicates: number;
  validPercent: number;
  approvedBaselineRows: number | null;
  baselinePercent: number | null;
  integrityStatus: IntegrityStatus;
  warnings: string[];
  blockingFailures: string[];
};

export type SupplierGlobalReport = {
  uniqueSkus: number;
  presentIn4: number;
  presentIn3: number;
  presentIn2: number;
  presentIn1: number;
  newProducts: number | null;
  existingProducts: number | null;
  missingProducts: number | null;
  pricesUnchanged: number | null;
  pricesChanging: number | null;
  warnings: number;
  blockedPrices: number;
  anomalies: number;
  inconsistentNames: number;
  inconsistentPresentations: number;
  eligibility: Record<SupplierProductEligibilityStatus, { count: number; percent: number }>;
};

export type SupplierDryRunReport = {
  mode: 'dry-run';
  supplierCode: string;
  generatedAt: string;
  canWrite: boolean;
  snapshotAvailable: boolean;
  snapshotNote: string | null;
  lists: Record<SupplierPriceType, SupplierListReport>;
  global: SupplierGlobalReport;
  anomalies: PlannedSupplierAnomaly[];
};

export type SupplierSyncPlan = {
  status: Exclude<SupplierSyncStatus, 'running'>;
  canApply: boolean;
  productsRead: number;
  products: PlannedSupplierProduct[];
  anomalies: PlannedSupplierAnomaly[];
  warnings: number;
  errors: number;
  blockedPrices: number;
  sourceSummary: Record<string, unknown>;
  report: SupplierDryRunReport;
};

export type SupplierGuardrails = {
  normalVariationPercent: number;
  blockingVariationPercent: number;
  extremelySmallRatio: number;
  crossListWarningRatio: number;
  crossListBlockingRatio: number;
  hierarchyBlockingOverageRatio: number;
  populationSmallWarningRatio: number;
  populationSmallBlockingRatio: number;
  populationMinimumSample: number;
  minimumProductsPerList: number;
  baselineWarningRatio: number;
  baselineBlockingRatio: number;
  invalidRowsWarningRatio: number;
  invalidRowsBlockingRatio: number;
  emissionDateSpreadWarningDays: number;
  emissionDateAgeWarningDays: number;
};

export const DEFAULT_SUPPLIER_GUARDRAILS: SupplierGuardrails = {
  normalVariationPercent: 20,
  blockingVariationPercent: 50,
  extremelySmallRatio: 0.1,
  crossListWarningRatio: 4,
  crossListBlockingRatio: 10,
  hierarchyBlockingOverageRatio: 1.05,
  populationSmallWarningRatio: 0.1,
  populationSmallBlockingRatio: 0.02,
  populationMinimumSample: 20,
  minimumProductsPerList: 1,
  baselineWarningRatio: 0.95,
  baselineBlockingRatio: 0.85,
  invalidRowsWarningRatio: 0.01,
  invalidRowsBlockingRatio: 0.05,
  emissionDateSpreadWarningDays: 14,
  emissionDateAgeWarningDays: 45,
};

export type SupplierRunHandle = { tenantId: string; supplierId: string; runId: string };

export type SupplierSyncResult = {
  mode: 'write';
  runId: string;
  supplierId: string;
  status: Exclude<SupplierSyncStatus, 'running'>;
  productsRead: number;
  productsCreated: number;
  pricesUpdated: number;
  pricesUnchanged: number;
  warnings: number;
  errors: number;
  anomalies: number;
  report: SupplierDryRunReport;
};
