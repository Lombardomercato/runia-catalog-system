import {
  changeDraftOrderItemQuantity,
  consolidateDraftOrderItems,
  ordersFailure,
  rebuildDraftOrder,
  resolveDraftOrderItems,
} from '../draftOrder';
import type { OrdersResult } from '../errors';
import type {
  DraftOrder,
  DraftOrderItem,
  DraftOrderProductResolver,
  DraftOrderReader,
  DraftOrderRepository,
  DraftOrderRuntime,
  UpdateDraftOrderInput,
} from '../interfaces';

export class UpdateDraftOrder {
  constructor(
    private readonly reader: DraftOrderReader,
    private readonly repository: DraftOrderRepository,
    private readonly products: DraftOrderProductResolver,
    private readonly runtime: DraftOrderRuntime,
  ) {}

  async execute(input: UpdateDraftOrderInput): Promise<OrdersResult<DraftOrder>> {
    const current = await this.reader.execute(input);
    if (!current.ok) return current;
    if (current.value.status === 'submitted') {
      return ordersFailure('INVALID_STATUS_TRANSITION', 'A submitted draft order is immutable.');
    }

    const changes = consolidateDraftOrderItems(input.items, true);
    if (!changes.ok) return changes;

    const existingByProduct = new Map<string, DraftOrderItem>();
    for (const item of current.value.items) {
      const existing = existingByProduct.get(item.productId);
      if (!existing) {
        existingByProduct.set(item.productId, item);
        continue;
      }
      const unified = changeDraftOrderItemQuantity(existing, existing.quantity + item.quantity);
      if (!unified) {
        return ordersFailure('PRICE_UNAVAILABLE', 'An existing draft order item is invalid.');
      }
      existingByProduct.set(item.productId, unified);
    }

    const updatedItems: DraftOrderItem[] = [];
    for (const [productId, existing] of existingByProduct) {
      const quantity = changes.value.has(productId)
        ? changes.value.get(productId)!
        : existing.quantity;
      if (quantity === 0) continue;
      const updated = changeDraftOrderItemQuantity(existing, quantity);
      if (!updated) {
        return ordersFailure('PRICE_UNAVAILABLE', `Product "${productId}" has an invalid price.`);
      }
      if (updated.resolvedPrice.currency !== current.value.currency) {
        return ordersFailure('CURRENCY_MISMATCH', 'Draft order items use mixed currencies.');
      }
      updatedItems.push(updated);
    }

    const newQuantities = new Map(
      [...changes.value].filter(
        ([productId, quantity]) => quantity > 0 && !existingByProduct.has(productId),
      ),
    );
    const newItems = await resolveDraftOrderItems(
      current.value.tenantId,
      current.value.currency,
      newQuantities,
      this.products,
    );
    if (!newItems.ok) return newItems;

    let updatedDraft: DraftOrder | null;
    try {
      updatedDraft = rebuildDraftOrder(
        current.value,
        [...updatedItems, ...newItems.value],
        this.runtime.now(),
      );
    } catch {
      return ordersFailure('REPOSITORY_FAILURE', 'The draft order could not be updated.');
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
