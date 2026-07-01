import type { DraftOrderRuntime } from '@/core/orders/interfaces';

export class SystemDraftOrderRuntime implements DraftOrderRuntime {
  createId() {
    return crypto.randomUUID();
  }

  now() {
    return new Date().toISOString();
  }
}
