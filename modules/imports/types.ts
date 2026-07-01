export const IMPORT_SHEETS = ['Categorias', 'Marcas', 'Productos', 'Precios'] as const;

export type ImportSheetName = (typeof IMPORT_SHEETS)[number];
export type ImportMode = 'preview' | 'import';
export type ImportRowStatus = 'success' | 'error' | 'skipped';
export type SheetRow = Record<string, unknown>;

export type ImportTenant = {
  id: string;
  name: string;
  slug: string;
};

export type ImportValidationError = {
  sheet: ImportSheetName;
  rowNumber: number;
  field: string;
  error: string;
  value: string | number | boolean | null;
};

export type ImportSheetStats = {
  rowsRead: number;
  rowsValid: number;
  errors: number;
  toCreate: number;
  toUpdate: number;
};

export type ImportReport = {
  mode: ImportMode;
  sourceFile: string;
  tenantSlug: string;
  startedAt: string;
  finishedAt: string;
  blocked: boolean;
  stats: Record<ImportSheetName, ImportSheetStats>;
  errors: ImportValidationError[];
  fatalError?: string;
};

export type ExistingImportState = {
  categoriesByExternalId: Map<string, string>;
  brandsByExternalId: Map<string, string>;
  productsBySku: Map<string, string>;
  pricesByProductAndList: Set<string>;
  priceListsByCode: Map<string, string>;
};

export type ValidatedCategory = {
  rowNumber: number;
  raw: SheetRow;
  externalId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type ValidatedBrand = {
  rowNumber: number;
  raw: SheetRow;
  externalId: string;
  name: string;
  priceAdjustmentPercent: number;
  isActive: boolean;
};

export type ValidatedProduct = {
  rowNumber: number;
  raw: SheetRow;
  sku: string;
  categoryExternalId: string;
  brandExternalId: string;
  productLine: string | null;
  name: string;
  variant: string | null;
  description: string | null;
  sourcePage: string | null;
  internalNotes: string | null;
  isActive: boolean;
};

export type ValidatedPrice = {
  rowNumber: number;
  raw: SheetRow;
  sku: string;
  priceListCode: string;
  priceListName: string;
  price: number;
  currency: string;
};

export type ValidatedWorkbook = {
  categories: ValidatedCategory[];
  brands: ValidatedBrand[];
  products: ValidatedProduct[];
  prices: ValidatedPrice[];
  errors: ImportValidationError[];
  rowsRead: Record<ImportSheetName, number>;
};

export type ImportCountMap = Record<ImportSheetName, number>;

export type ImportExecutionCounts = {
  created: ImportCountMap;
  updated: ImportCountMap;
};

export type ImportCommandResult = {
  ok: boolean;
  stage: 'preview' | 'completed' | 'failed';
  report: ImportReport | null;
  batchId: string | null;
  message: string | null;
  error: string | null;
  warning: string | null;
};

export type ImportHistoryItem = {
  id: string;
  sourceName: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  totalRows: number;
  errorCount: number;
  toCreate: number;
  toUpdate: number;
};

export type ImportHistoryResult = {
  imports: ImportHistoryItem[];
  error: string | null;
};
