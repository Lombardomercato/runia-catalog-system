import {
  calculateDraftOrderSummary,
  consolidateDraftOrderItems,
  ordersFailure,
  resolveDraftOrderItems,
} from '../draftOrder';
import type { OrdersResult } from '../errors';
import type {
  CreateDraftOrderInput,
  DraftOrder,
  DraftOrderProductResolver,
  DraftOrderRepository,
  DraftOrderRuntime,
} from '../interfaces';

export class CreateDraftOrder {
  constructor(
    private readonly repository: DraftOrderRepository,
    private readonly products: DraftOrderProductResolver,
    private readonly runtime: DraftOrderRuntime,
  ) {}

  async execute(input: CreateDraftOrderInput): Promise<OrdersResult<DraftOrder>> {
    const tenantId = input.tenantId.trim();
    const sessionId = input.sessionId.trim();
    const currency = input.currency.trim().toUpperCase();
    if (!tenantId) return ordersFailure('INVALID_INPUT', 'The tenant ID is required.');
    if (!sessionId) return ordersFailure('SESSION_REQUIRED', 'The session ID is required.');
    if (!/^[A-Z]{3}$/.test(currency)) {
      return ordersFailure('INVALID_INPUT', 'The draft order currency is invalid.');
    }
    if (!input.items.length) {
      return ordersFailure('EMPTY_ORDER', 'A draft order requires at least one product.');
    }

    const quantities = consolidateDraftOrderItems(input.items, false);
    if (!quantities.ok) return quantities;
    const items = await resolveDraftOrderItems(
      tenantId,
      currency,
      quantities.value,
      this.products,
    );
    if (!items.ok) return items;

    const summary = calculateDraftOrderSummary(items.value, currency);
    if (!summary) return ordersFailure('INVALID_INPUT', 'Draft order totals could not be resolved.');

    let draftOrder: DraftOrder;
    try {
      const timestamp = this.runtime.now();
      const id = this.runtime.createId().trim();
      if (!id || !timestamp) {
        return ordersFailure('REPOSITORY_FAILURE', 'Draft order identity could not be created.');
      }
      draftOrder = {
        id,
        tenantId,
        sessionId,
        status: 'draft',
        currency,
        items: items.value,
        summary,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await this.repository.save(draftOrder);
    } catch {
      return ordersFailure('REPOSITORY_FAILURE', 'The draft order could not be saved.');
    }

    return { ok: true, value: draftOrder };
  }
}
