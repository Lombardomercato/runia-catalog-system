export type ImportSheetName = 'Categorias' | 'Marcas' | 'Productos' | 'Precios';
export type ImportBatchStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ImportSource {
  name: string;
  mediaType: string;
  content: Uint8Array;
}

export interface ImportValidationIssue {
  sheet: ImportSheetName;
  rowNumber: number;
  field: string;
  message: string;
  receivedValue: string | number | boolean | null;
  critical: boolean;
}

export interface ImportSheetSummary {
  rowsRead: number;
  rowsValid: number;
  errors: number;
  toCreate: number;
  toUpdate: number;
}

export interface ImportPreview {
  sourceName: string;
  blocked: boolean;
  sheets: Record<ImportSheetName, ImportSheetSummary>;
  issues: ImportValidationIssue[];
  validatedAt: string;
}

export interface ImportBatch {
  id: string;
  tenantId: string;
  sourceName: string;
  status: ImportBatchStatus;
  preview: ImportPreview;
  startedAt: string;
  finishedAt: string | null;
}

export interface ImportBatchListQuery {
  status?: ImportBatchStatus;
  page?: number;
  pageSize?: number;
}

export interface ImportBatchPage {
  items: ImportBatch[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
