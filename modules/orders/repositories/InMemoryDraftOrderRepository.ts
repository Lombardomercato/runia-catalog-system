import type {
  DraftOrder,
  DraftOrderRepository,
  GetDraftOrderInput,
} from '@/core/orders/interfaces';

export class InMemoryDraftOrderRepository implements DraftOrderRepository {
  private readonly draftOrders = new Map<string, DraftOrder>();

  async save(draftOrder: DraftOrder): Promise<void> {
    this.draftOrders.set(keyFor(draftOrder), structuredClone(draftOrder));
  }

  async findById(input: GetDraftOrderInput): Promise<DraftOrder | null> {
    const draftOrder = this.draftOrders.get(keyFor({
      id: input.draftOrderId,
      tenantId: input.tenantId,
      sessionId: input.sessionId,
    }));
    return draftOrder ? structuredClone(draftOrder) : null;
  }
}

function keyFor(value: { id: string; tenantId: string; sessionId: string }) {
  return `${value.tenantId}\u0000${value.sessionId}\u0000${value.id}`;
}
