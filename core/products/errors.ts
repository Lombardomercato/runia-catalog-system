export type ProductsErrorCode =
  | 'INVALID_INPUT'
  | 'PRODUCT_NOT_FOUND'
  | 'DUPLICATE_SKU'
  | 'CATEGORY_NOT_FOUND'
  | 'BRAND_NOT_FOUND'
  | 'TENANT_NOT_FOUND'
  | 'TENANT_INACTIVE'
  | 'PUBLIC_CATALOG_DISABLED'
  | 'PUBLIC_PRICE_LIST_NOT_FOUND'
  | 'FORBIDDEN'
  | 'REPOSITORY_FAILURE';

export interface ProductsDomainError {
  domain: 'products';
  code: ProductsErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  requestId?: string;
}

export type ProductsResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProductsDomainError };
