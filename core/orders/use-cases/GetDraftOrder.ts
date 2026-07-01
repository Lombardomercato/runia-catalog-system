import type { OrdersDomainError, OrdersResult } from '../errors';
import type { DraftOrder, DraftOrderRepository, GetDraftOrderInput } from '../interfaces';

export class GetDraftOrder {
  constructor(private readonly repository: DraftOrderRepository) {}

  async execute(input: GetDraftOrderInput): Promise<OrdersResult<DraftOrder>> {
    const tenantId = input.tenantId.trim();
    const sessionId = input.sessionId.trim();
    const draftOrderId = input.draftOrderId.trim();
    if (!tenantId || !draftOrderId) {
      return ordersFailure('INVALID_INPUT', 'Tenant ID and draft order ID are required.');
    }
    if (!sessionId) return ordersFailure('SESSION_REQUIRED', 'The session ID is required.');

    let draftOrder;
    try {
      draftOrder = await this.repository.findById({ tenantId, sessionId, draftOrderId });
    } catch {
      return ordersFailure('REPOSITORY_FAILURE', 'The draft order could not be loaded.');
    }

    if (
      !draftOrder ||
      draftOrder.tenantId !== tenantId ||
      draftOrder.sessionId !== sessionId ||
      draftOrder.id !== draftOrderId
    ) {
      return ordersFailure('DRAFT_ORDER_NOT_FOUND', 'The draft order was not found.');
    }

    return { ok: true, value: draftOrder };
  }
}

function ordersFailure(
  code: OrdersDomainError['code'],
  message: string,
): OrdersResult<never> {
  return { ok: false, error: { domain: 'orders', code, message } };
}
