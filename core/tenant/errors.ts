export type TenantErrorCode =
  | 'INVALID_INPUT'
  | 'TENANT_NOT_FOUND'
  | 'TENANT_INACTIVE'
  | 'PUBLIC_PRICE_LIST_NOT_FOUND'
  | 'PUBLIC_CONFIG_INVALID'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'REPOSITORY_FAILURE';

export interface TenantDomainError {
  domain: 'tenant';
  code: TenantErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  requestId?: string;
}

export type TenantResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: TenantDomainError };
