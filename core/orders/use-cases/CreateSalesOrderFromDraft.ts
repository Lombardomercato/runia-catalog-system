import { ordersFailure } from '../draftOrder';
import type { OrdersResult } from '../errors';
import type {
  CreateSalesOrderFromDraftInput,
  CreateSalesOrderFromDraftOutput,
  DraftOrder,
  DraftOrderConfirmer,
  DraftOrderReader,
  DraftOrderRepository,
  DraftOrderRuntime,
  PersistSalesOrderFromDraftInput,
  SalesOrderFromDraftRepository,
} from '../interfaces';

export class CreateSalesOrderFromDraft {
  constructor(
    private readonly reader: DraftOrderReader,
    private readonly confirmer: DraftOrderConfirmer,
    private readonly draftRepository: DraftOrderRepository,
    private readonly salesOrderRepository: SalesOrderFromDraftRepository,
    private readonly runtime: DraftOrderRuntime,
  ) {}

  async execute(
    input: CreateSalesOrderFromDraftInput,
  ): Promise<OrdersResult<CreateSalesOrderFromDraftOutput>> {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) {
      return ordersFailure('INVALID_INPUT', 'An idempotency key is required.');
    }

    const current = await this.reader.execute(input);
    if (!current.ok) return current;

    const existing = await this.findExisting(current.value, idempotencyKey);
    if (!existing.ok) return existing;
    if (existing.value) {
      const submitted = await this.markSubmitted(current.value);
      if (!submitted.ok) return submitted;
      return {
        ok: true,
        value: { order: existing.value, draftOrder: submitted.value, created: false },
      };
    }

    if (current.value.status !== 'ready_to_submit') {
      return ordersFailure(
        'INVALID_STATUS_TRANSITION',
        'The draft order must be ready to submit before creating a sales order.',
      );
    }
    if (
      input.commercial.currency.trim().toUpperCase() !== current.value.currency ||
      !input.commercial.tenantName.trim() ||
      !input.commercial.priceListId.trim() ||
      !input.commercial.priceListCode.trim() ||
      !input.commercial.priceListName.trim()
    ) {
      return ordersFailure('INVALID_INPUT', 'Commercial configuration is incomplete.');
    }

    const confirmed = await this.confirmer.execute(input);
    if (!confirmed.ok) return confirmed;
    const persistenceInput = buildPersistenceInput(
      confirmed.value.draftOrder,
      idempotencyKey,
      input.commercial,
    );

    let persisted;
    try {
      persisted = await this.salesOrderRepository.createTransactional(persistenceInput);
    } catch {
      return ordersFailure('REPOSITORY_FAILURE', 'The sales order could not be persisted.');
    }

    const submitted = await this.markSubmitted(confirmed.value.draftOrder);
    if (!submitted.ok) return submitted;
    return {
      ok: true,
      value: { ...persisted, draftOrder: submitted.value },
    };
  }

  private async findExisting(draftOrder: DraftOrder, idempotencyKey: string) {
    try {
      const order = await this.salesOrderRepository.findByDraft({
        tenantId: draftOrder.tenantId,
        sourceDraftId: draftOrder.id,
        idempotencyKey,
      });
      return { ok: true as const, value: order };
    } catch {
      return ordersFailure('REPOSITORY_FAILURE', 'The idempotent sales order lookup failed.');
    }
  }

  private async markSubmitted(draftOrder: DraftOrder): Promise<OrdersResult<DraftOrder>> {
    if (draftOrder.status === 'submitted') return { ok: true, value: draftOrder };
    const updatedAt = this.runtime.now().trim();
    if (!updatedAt) {
      return ordersFailure('REPOSITORY_FAILURE', 'The draft order could not be finalized.');
    }
    const submitted: DraftOrder = { ...draftOrder, status: 'submitted', updatedAt };
    try {
      await this.draftRepository.save(submitted);
      return { ok: true, value: submitted };
    } catch {
      return ordersFailure(
        'REPOSITORY_FAILURE',
        'The sales order exists, but the local draft could not be finalized.',
      );
    }
  }
}

function buildPersistenceInput(
  draftOrder: DraftOrder,
  idempotencyKey: string,
  commercial: CreateSalesOrderFromDraftInput['commercial'],
): PersistSalesOrderFromDraftInput {
  const identity = draftOrder.identity!;
  return {
    tenantId: draftOrder.tenantId,
    sourceDraftId: draftOrder.id,
    idempotencyKey,
    identity,
    commercial: {
      ...commercial,
      tenantName: commercial.tenantName.trim(),
      priceListId: commercial.priceListId.trim(),
      priceListCode: commercial.priceListCode.trim(),
      priceListName: commercial.priceListName.trim(),
      currency: commercial.currency.trim().toUpperCase(),
      channel: 'public_commerce',
    },
    items: draftOrder.items.map((item) => ({
      productId: item.productSnapshot.productId,
      sku: item.productSnapshot.sku,
      name: item.productSnapshot.name,
      variant: item.productSnapshot.variant,
      line: item.productSnapshot.line,
      brandName: item.productSnapshot.brandName,
      categoryName: item.productSnapshot.categoryName,
      unitPrice: item.resolvedPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
    subtotal: draftOrder.summary.subtotal,
    discount: draftOrder.summary.discount,
    total: draftOrder.summary.total,
    notes: identity.notes,
    draftSnapshot: structuredClone(draftOrder),
  };
}
