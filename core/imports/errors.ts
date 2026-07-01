export type ImportsErrorCode =
  | 'INVALID_SOURCE'
  | 'UNSUPPORTED_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'VALIDATION_FAILED'
  | 'IMPORT_BLOCKED'
  | 'BATCH_NOT_FOUND'
  | 'IMPORT_IN_PROGRESS'
  | 'FORBIDDEN'
  | 'REPOSITORY_FAILURE';

export interface ImportsDomainError {
  domain: 'imports';
  code: ImportsErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  requestId?: string;
}

export type ImportsResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ImportsDomainError };
