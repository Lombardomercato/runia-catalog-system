import { ordersFailure, rebuildDraftOrder } from '../draftOrder';
import type { OrdersResult } from '../errors';
import type {
  DraftOrder,
  DraftOrderIdentityValidator,
  DraftOrderReader,
  DraftOrderRepository,
  DraftOrderRuntime,
  PrepareDraftCheckoutInput,
} from '../interfaces';

export class PrepareDraftCheckout {
  constructor(
    private readonly reader: DraftOrderReader,
    private readonly repository: DraftOrderRepository,
    private readonly runtime: DraftOrderRuntime,
    private readonly identityValidator: DraftOrderIdentityValidator,
  ) {}

  async execute(input: PrepareDraftCheckoutInput): Promise<OrdersResult<DraftOrder>> {
    const current = await this.reader.execute(input);
    if (!current.ok) return current;
    if (current.value.status === 'submitted') {
      return ordersFailure('INVALID_STATUS_TRANSITION', 'A submitted draft order is immutable.');
    }
    if (!current.value.items.length) {
      return ordersFailure('EMPTY_ORDER', 'A draft order requires at least one product.');
    }

    const identity = this.identityValidator.execute(input.identity);
    if (!identity.ok) return identity;

    let prepared: DraftOrder | null;
    try {
      prepared = rebuildDraftOrder(current.value, current.value.items, this.runtime.now());
    } catch {
      return ordersFailure('REPOSITORY_FAILURE', 'The draft order could not be prepared.');
    }
    if (!prepared) {
      return ordersFailure('PRICE_UNAVAILABLE', 'Draft order totals could not be resolved.');
    }

    const withIdentity: DraftOrder = {
      ...prepared,
      status: 'draft',
      identity: identity.value,
    };
    try {
      await this.repository.save(withIdentity);
    } catch {
      return ordersFailure('REPOSITORY_FAILURE', 'The draft order identity could not be saved.');
    }
    return { ok: true, value: withIdentity };
  }
}
