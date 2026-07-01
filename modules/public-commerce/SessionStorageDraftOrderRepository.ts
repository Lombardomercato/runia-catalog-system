import type {
  DraftOrder,
  DraftOrderRepository,
  DraftOrderRuntime,
  GetDraftOrderInput,
} from '@/core/orders/interfaces';
import type { PublicCommerceStorage } from './types';

const STORAGE_VERSION = 'v1';
const SESSION_KEY = `runia-commerce:${STORAGE_VERSION}:session`;

export class SessionStorageDraftOrderRepository implements DraftOrderRepository {
  constructor(private readonly storage: PublicCommerceStorage) {}

  async save(draftOrder: DraftOrder): Promise<void> {
    this.storage.setItem(draftKey(draftOrder), JSON.stringify(draftOrder));
  }

  async findById(input: GetDraftOrderInput): Promise<DraftOrder | null> {
    const raw = this.storage.getItem(draftKey({
      id: input.draftOrderId,
      tenantId: input.tenantId,
      sessionId: input.sessionId,
    }));
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isDraftOrder(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  getOrCreateSessionId(runtime: DraftOrderRuntime) {
    const current = this.storage.getItem(SESSION_KEY)?.trim();
    if (current) return current;
    const sessionId = runtime.createId();
    this.storage.setItem(SESSION_KEY, sessionId);
    return sessionId;
  }

  getActiveDraftId(tenantId: string) {
    return this.storage.getItem(activeDraftKey(tenantId))?.trim() || null;
  }

  setActiveDraftId(tenantId: string, draftOrderId: string) {
    this.storage.setItem(activeDraftKey(tenantId), draftOrderId);
  }

  clearActiveDraftId(tenantId: string) {
    this.storage.removeItem(activeDraftKey(tenantId));
  }
}

function activeDraftKey(tenantId: string) {
  return `runia-commerce:${STORAGE_VERSION}:active:${encodeURIComponent(tenantId)}`;
}

function draftKey(value: { id: string; tenantId: string; sessionId: string }) {
  return [
    'runia-commerce',
    STORAGE_VERSION,
    'draft',
    encodeURIComponent(value.tenantId),
    encodeURIComponent(value.sessionId),
    encodeURIComponent(value.id),
  ].join(':');
}

function isDraftOrder(value: unknown): value is DraftOrder {
  if (!isRecord(value)) return false;
  if (
    !isString(value.id) ||
    !isString(value.tenantId) ||
    !isString(value.sessionId) ||
    value.status !== 'draft' ||
    !isString(value.currency) ||
    !isString(value.createdAt) ||
    !isString(value.updatedAt) ||
    !Array.isArray(value.items) ||
    !value.items.every(isDraftOrderItem) ||
    !isSummary(value.summary)
  ) {
    return false;
  }
  return true;
}

function isDraftOrderItem(value: unknown) {
  if (!isRecord(value) || !isRecord(value.productSnapshot)) return false;
  return (
    isString(value.productId) &&
    isString(value.sku) &&
    isString(value.name) &&
    isNullableString(value.variant) &&
    Number.isSafeInteger(value.quantity) &&
    isMoney(value.resolvedPrice) &&
    isMoney(value.subtotal) &&
    isString(value.productSnapshot.productId) &&
    isString(value.productSnapshot.sku) &&
    isString(value.productSnapshot.name) &&
    isNullableString(value.productSnapshot.variant) &&
    isNullableString(value.productSnapshot.line) &&
    isNullableString(value.productSnapshot.brandName) &&
    isNullableString(value.productSnapshot.categoryName)
  );
}

function isSummary(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    Number.isSafeInteger(value.totalQuantity) &&
    isMoney(value.subtotal) &&
    isMoney(value.discount) &&
    isMoney(value.total)
  );
}

function isMoney(value: unknown) {
  return isRecord(value) && isString(value.amount) && isString(value.currency);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown) {
  return value === null || isString(value);
}
