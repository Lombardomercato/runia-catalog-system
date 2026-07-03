import { ordersFailure, rebuildDraftOrder } from '../draftOrder';
import type { OrdersResult } from '../errors';
import type {
  DraftOrder,
  DraftOrderReader,
  DraftOrderRepository,
  DraftOrderRuntime,
  RemoveDraftOrderItemInput,
} from '../interfaces';

export class RemoveDraftOrderItem {
  constructor(
    private readonly reader: DraftOrderReader,
    private readonly repository: DraftOrderRepository,
    private readonly runtime: DraftOrderRuntime,
  ) {}

  async execute(input: RemoveDraftOrderItemInput): Promise<OrdersResult<DraftOrder>> {
    const current = await this.reader.execute(input);
    if (!current.ok) return current;
    if (current.value.status === 'submitted') {
      return ordersFailure('INVALID_STATUS_TRANSITION', 'A submitted draft order is immutable.');
    }

    const productId = input.productId.trim();
    if (!productId) return ordersFailure('INVALID_INPUT', 'The product ID is required.');
    if (!current.value.items.some((item) => item.productId === productId)) {
      return ordersFailure('DRAFT_ORDER_ITEM_NOT_FOUND', 'The draft order item was not found.');
    }

    let updatedDraft: DraftOrder | null;
    try {
      updatedDraft = rebuildDraftOrder(
        current.value,
        current.value.items.filter((item) => item.productId !== productId),
        this.runtime.now(),
      );
    } catch {
      return ordersFailure('REPOSITORY_FAILURE', 'The draft order item could not be removed.');
    }
    if (!updatedDraft) {
      return ordersFailure('PRICE_UNAVAILABLE', 'Draft order totals could not be recalculated.');
    }
    updatedDraft = { ...updatedDraft, status: 'draft' };

    try {
      await this.repository.save(updatedDraft);
    } catch {
      return ordersFailure('REPOSITORY_FAILURE', 'The draft order could not be saved.');
    }
    return { ok: true, value: updatedDraft };
  }
}
