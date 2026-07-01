export type AccountsErrorCode =
  | 'INVALID_INPUT'
  | 'ACCOUNT_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_INACTIVE'
  | 'PRICE_LIST_NOT_FOUND'
  | 'DUPLICATE_ACCOUNT'
  | 'FORBIDDEN'
  | 'REPOSITORY_FAILURE';

export interface AccountsDomainError {
  domain: 'accounts';
  code: AccountsErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  requestId?: string;
}

export type AccountsResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AccountsDomainError };
