export type OrdersErrorCode =
  | 'INVALID_INPUT'
  | 'ORDER_NOT_FOUND'
  | 'DRAFT_ORDER_NOT_FOUND'
  | 'DRAFT_ORDER_ITEM_NOT_FOUND'
  | 'SESSION_REQUIRED'
  | 'INVALID_QUANTITY'
  | 'CURRENCY_MISMATCH'
  | 'ACCOUNT_REQUIRED'
  | 'ACCOUNT_NOT_FOUND'
  | 'EMPTY_ORDER'
  | 'PRODUCT_NOT_FOUND'
  | 'PRICE_UNAVAILABLE'
  | 'INVALID_STATUS_TRANSITION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'FORBIDDEN'
  | 'REPOSITORY_FAILURE';

export interface OrdersDomainError {
  domain: 'orders';
  code: OrdersErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  requestId?: string;
}

export type OrdersResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: OrdersDomainError };
