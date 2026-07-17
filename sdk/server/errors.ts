import 'server-only';

export type CommerceSdkErrorCode =
  | 'INVALID_CLIENT_CONFIG'
  | 'INVALID_INPUT'
  | 'TENANT_NOT_FOUND'
  | 'TENANT_INACTIVE'
  | 'PUBLIC_CATALOG_DISABLED'
  | 'PUBLIC_PRICE_LIST_NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_NOT_VISIBLE'
  | 'PUBLIC_PRICE_NOT_FOUND'
  | 'CURRENCY_UNAVAILABLE'
  | 'WHATSAPP_NOT_CONFIGURED'
  | 'REPOSITORY_FAILURE';

export type CommerceSdkOperation =
  | 'client'
  | 'tenant.getPublicConfig'
  | 'tenant.buildWhatsAppUrl'
  | 'products.list'
  | 'products.featured'
  | 'products.getBySku'
  | 'categories.list'
  | 'brands.list'
  | 'pricing.resolve';

export class CommerceSdkError extends Error {
  readonly code: CommerceSdkErrorCode;
  readonly operation: CommerceSdkOperation;

  constructor(
    code: CommerceSdkErrorCode,
    operation: CommerceSdkOperation,
    message: string,
  ) {
    super(message);
    this.name = 'CommerceSdkError';
    this.code = code;
    this.operation = operation;
  }
}

export function isCommerceSdkError(error: unknown): error is CommerceSdkError {
  return error instanceof CommerceSdkError;
}

export function hasCommerceErrorCode(
  error: unknown,
  ...codes: CommerceSdkErrorCode[]
): error is CommerceSdkError {
  return isCommerceSdkError(error) && codes.includes(error.code);
}

export function isCommerceNotFoundError(error: unknown): error is CommerceSdkError {
  return hasCommerceErrorCode(
    error,
    'TENANT_NOT_FOUND',
    'PRODUCT_NOT_FOUND',
    'PRODUCT_NOT_VISIBLE',
  );
}

export const commerceErrorGuards = Object.freeze({
  isSdkError: isCommerceSdkError,
  hasCode: hasCommerceErrorCode,
  isNotFound: isCommerceNotFoundError,
});

type DomainError = {
  code: string;
  message: string;
};

export function commerceErrorFromDomain(
  error: DomainError,
  operation: CommerceSdkOperation,
) {
  return new CommerceSdkError(normalizeCode(error.code), operation, error.message);
}

function normalizeCode(code: string): CommerceSdkErrorCode {
  if (
    code === 'INVALID_INPUT' ||
    code === 'TENANT_NOT_FOUND' ||
    code === 'TENANT_INACTIVE' ||
    code === 'PUBLIC_CATALOG_DISABLED' ||
    code === 'PUBLIC_PRICE_LIST_NOT_FOUND' ||
    code === 'PRODUCT_NOT_FOUND' ||
    code === 'PRODUCT_NOT_VISIBLE' ||
    code === 'PUBLIC_PRICE_NOT_FOUND' ||
    code === 'CURRENCY_UNAVAILABLE' ||
    code === 'WHATSAPP_NOT_CONFIGURED'
  ) {
    return code;
  }
  return 'REPOSITORY_FAILURE';
}
