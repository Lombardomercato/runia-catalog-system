import type { TenantExecutionContext } from '../tenant/interfaces';
import type { ImportsResult } from './errors';
import type {
  ImportBatch,
  ImportBatchListQuery,
  ImportBatchPage,
  ImportPreview,
  ImportSource,
} from './interfaces';

export interface ImportsService {
  preview(
    context: TenantExecutionContext,
    source: ImportSource,
  ): Promise<ImportsResult<ImportPreview>>;
  execute(
    context: TenantExecutionContext,
    source: ImportSource,
  ): Promise<ImportsResult<ImportBatch>>;
  getBatch(
    context: TenantExecutionContext,
    id: string,
  ): Promise<ImportsResult<ImportBatch | null>>;
  listBatches(
    context: TenantExecutionContext,
    query?: ImportBatchListQuery,
  ): Promise<ImportsResult<ImportBatchPage>>;
}
