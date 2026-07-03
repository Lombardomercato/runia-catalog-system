import { isPositiveMoneyAmount, ordersFailure } from '../draftOrder';
import type { OrdersResult } from '../errors';
import type {
  ConfirmDraftOrderInput,
  ConfirmedDraftOrder,
  DraftOrder,
  DraftOrderIdentityValidator,
  DraftOrderReader,
  DraftOrderRepository,
  DraftOrderResolver,
  DraftOrderRuntime,
} from '../interfaces';

export class ConfirmDraftOrder {
  constructor(
    private readonly reader: DraftOrderReader,
    private readonly resolver: DraftOrderResolver,
    private readonly repository: DraftOrderRepository,
    private readonly runtime: DraftOrderRuntime,
    private readonly identityValidator: DraftOrderIdentityValidator,
  ) {}

  async execute(input: ConfirmDraftOrderInput): Promise<OrdersResult<ConfirmedDraftOrder>> {
    const current = await this.reader.execute(input);
    if (!current.ok) return current;
    if (current.value.status === 'submitted') {
      return ordersFailure('INVALID_STATUS_TRANSITION', 'A submitted draft order is immutable.');
    }
    if (!current.value.items.length) {
      return ordersFailure('DRAFT_ORDER_NOT_READY', 'The draft order has no products.');
    }
    if (!current.value.identity) {
      return ordersFailure('DRAFT_ORDER_NOT_READY', 'The draft order identity is required.');
    }

    const identity = this.identityValidator.execute(current.value.identity);
    if (!identity.ok) return identity;

    const resolved = await this.resolver.execute(input);
    if (!resolved.ok) return resolved;
    if (
      resolved.value.currency !== current.value.currency ||
      !isPositiveMoneyAmount(resolved.value.total.amount)
    ) {
      return ordersFailure(
        'DRAFT_ORDER_NOT_READY',
        'The draft order must have a positive total in a single currency.',
      );
    }

    const updatedAt = this.runtime.now().trim();
    if (!updatedAt) {
      return ordersFailure('REPOSITORY_FAILURE', 'The draft order could not be confirmed.');
    }
    const confirmed: DraftOrder = {
      ...current.value,
      status: 'ready_to_submit',
      identity: identity.value,
      summary: {
        totalQuantity: resolved.value.totalQuantity,
        subtotal: resolved.value.subtotal,
        discount: resolved.value.discount,
        total: resolved.value.total,
      },
      updatedAt,
    };
    const summary = {
      ...resolved.value,
      status: confirmed.status,
      updatedAt,
    };

    try {
      await this.repository.save(confirmed);
    } catch {
      return ordersFailure('REPOSITORY_FAILURE', 'The confirmed draft order could not be saved.');
    }

    return {
      ok: true,
      value: {
        draftOrder: confirmed,
        summary,
        identity: identity.value,
        status: 'ready_to_submit',
      },
    };
  }
}
