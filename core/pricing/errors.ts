export type PricingErrorCode =
  | 'INVALID_INPUT'
  | 'PRICE_NOT_FOUND'
  | 'PRICE_LIST_NOT_FOUND'
  | 'PRICE_LIST_FORBIDDEN'
  | 'TENANT_INACTIVE'
  | 'PUBLIC_PRICE_LIST_NOT_FOUND'
  | 'PUBLIC_PRICE_NOT_FOUND'
  | 'CURRENCY_UNAVAILABLE'
  | 'COST_UNAVAILABLE'
  | 'MARGIN_OUT_OF_RANGE'
  | 'FORBIDDEN'
  | 'REPOSITORY_FAILURE';

export interface PricingDomainError {
  domain: 'pricing';
  code: PricingErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  requestId?: string;
}

export type PricingResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: PricingDomainError };
