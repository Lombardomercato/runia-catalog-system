import { ordersFailure, rebuildDraftOrder } from '../draftOrder';
import type { OrdersResult } from '../errors';
import type {
  DraftOrderReader,
  DraftOrderResolution,
  ResolveDraftOrderInput,
} from '../interfaces';

export class ResolveDraftOrder {
  constructor(private readonly reader: DraftOrderReader) {}

  async execute(
    input: ResolveDraftOrderInput,
  ): Promise<OrdersResult<DraftOrderResolution>> {
    const current = await this.reader.execute(input);
    if (!current.ok) return current;

    if (
      current.value.items.some(
        (item) => item.resolvedPrice.currency.trim().toUpperCase() !== current.value.currency,
      )
    ) {
      return ordersFailure('CURRENCY_MISMATCH', 'Draft order items use mixed currencies.');
    }
    const resolved = rebuildDraftOrder(
      current.value,
      current.value.items,
      current.value.updatedAt,
    );
    if (!resolved) {
      return ordersFailure('PRICE_UNAVAILABLE', 'Draft order totals could not be resolved.');
    }

    return {
      ok: true,
      value: {
        draftOrderId: resolved.id,
        totalQuantity: resolved.summary.totalQuantity,
        lineCount: resolved.items.length,
        productCount: new Set(resolved.items.map((item) => item.productId)).size,
        subtotal: resolved.summary.subtotal,
        discount: resolved.summary.discount,
        total: resolved.summary.total,
        currency: resolved.currency,
        status: resolved.status,
        updatedAt: resolved.updatedAt,
      },
    };
  }
}
