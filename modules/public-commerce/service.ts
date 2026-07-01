import { CreateDraftOrder } from '@/core/orders/use-cases/CreateDraftOrder';
import { GetDraftOrder } from '@/core/orders/use-cases/GetDraftOrder';
import { RemoveDraftOrderItem } from '@/core/orders/use-cases/RemoveDraftOrderItem';
import { ResolveDraftOrder } from '@/core/orders/use-cases/ResolveDraftOrder';
import { UpdateDraftOrder } from '@/core/orders/use-cases/UpdateDraftOrder';
import type { DraftOrder, DraftOrderResolution } from '@/core/orders/interfaces';
import { SystemDraftOrderRuntime } from '@/modules/orders/runtime/SystemDraftOrderRuntime';
import { PublicCommerceProductResolver } from './PublicCommerceProductResolver';
import { SessionStorageDraftOrderRepository } from './SessionStorageDraftOrderRepository';
import type {
  PublicCommerceDraft,
  PublicCommerceProduct,
  PublicCommerceResult,
  PublicCommerceStorage,
  PublicCommerceTenant,
} from './types';

export class PublicCommerceService {
  private readonly repository: SessionStorageDraftOrderRepository;
  private readonly products = new PublicCommerceProductResolver();
  private readonly runtime = new SystemDraftOrderRuntime();
  private readonly getDraftOrder: GetDraftOrder;
  private readonly createDraftOrder: CreateDraftOrder;
  private readonly updateDraftOrder: UpdateDraftOrder;
  private readonly removeDraftOrderItem: RemoveDraftOrderItem;
  private readonly resolveDraftOrder: ResolveDraftOrder;

  constructor(storage: PublicCommerceStorage) {
    this.repository = new SessionStorageDraftOrderRepository(storage);
    this.getDraftOrder = new GetDraftOrder(this.repository);
    this.createDraftOrder = new CreateDraftOrder(
      this.repository,
      this.products,
      this.runtime,
    );
    this.updateDraftOrder = new UpdateDraftOrder(
      this.getDraftOrder,
      this.repository,
      this.products,
      this.runtime,
    );
    this.removeDraftOrderItem = new RemoveDraftOrderItem(
      this.getDraftOrder,
      this.repository,
      this.runtime,
    );
    this.resolveDraftOrder = new ResolveDraftOrder(this.getDraftOrder);
  }

  async getSessionDraft(tenant: PublicCommerceTenant): Promise<PublicCommerceResult> {
    const active = await this.loadActiveDraft(tenant);
    if (!active) return { ok: true, draft: null };
    return this.toResult(tenant, active);
  }

  async addProduct(
    tenant: PublicCommerceTenant,
    product: PublicCommerceProduct,
  ): Promise<PublicCommerceResult> {
    this.products.register(tenant.id, product);
    const sessionId = this.repository.getOrCreateSessionId(this.runtime);
    const active = await this.loadActiveDraft(tenant);
    if (!active) {
      const created = await this.createDraftOrder.execute({
        tenantId: tenant.id,
        sessionId,
        currency: tenant.currency,
        items: [{ productId: product.id, quantity: 1 }],
      });
      if (!created.ok) return failureMessage(created.error.code);
      this.repository.setActiveDraftId(tenant.id, created.value.id);
      return this.toResult(tenant, created.value);
    }

    const existing = active.items.find((item) => item.productId === product.id);
    const updated = await this.updateDraftOrder.execute({
      tenantId: tenant.id,
      sessionId,
      draftOrderId: active.id,
      items: [{ productId: product.id, quantity: (existing?.quantity ?? 0) + 1 }],
    });
    return updated.ok ? this.toResult(tenant, updated.value) : failureMessage(updated.error.code);
  }

  async updateQuantity(
    tenant: PublicCommerceTenant,
    productId: string,
    quantity: number,
  ): Promise<PublicCommerceResult> {
    const active = await this.loadActiveDraft(tenant);
    if (!active) return { ok: false, error: 'No hay un pedido activo en esta sesion.' };
    const updated = await this.updateDraftOrder.execute({
      tenantId: tenant.id,
      sessionId: active.sessionId,
      draftOrderId: active.id,
      items: [{ productId, quantity }],
    });
    return updated.ok ? this.toResult(tenant, updated.value) : failureMessage(updated.error.code);
  }

  async removeProduct(
    tenant: PublicCommerceTenant,
    productId: string,
  ): Promise<PublicCommerceResult> {
    const active = await this.loadActiveDraft(tenant);
    if (!active) return { ok: false, error: 'No hay un pedido activo en esta sesion.' };
    const updated = await this.removeDraftOrderItem.execute({
      tenantId: tenant.id,
      sessionId: active.sessionId,
      draftOrderId: active.id,
      productId,
    });
    return updated.ok ? this.toResult(tenant, updated.value) : failureMessage(updated.error.code);
  }

  async resolveSummary(tenant: PublicCommerceTenant): Promise<PublicCommerceResult> {
    const active = await this.loadActiveDraft(tenant);
    return active ? this.toResult(tenant, active) : { ok: true, draft: null };
  }

  private async loadActiveDraft(tenant: PublicCommerceTenant) {
    const draftOrderId = this.repository.getActiveDraftId(tenant.id);
    if (!draftOrderId) return null;
    const sessionId = this.repository.getOrCreateSessionId(this.runtime);
    const result = await this.getDraftOrder.execute({
      tenantId: tenant.id,
      sessionId,
      draftOrderId,
    });
    if (!result.ok) {
      this.repository.clearActiveDraftId(tenant.id);
      return null;
    }
    return result.value;
  }

  private async toResult(
    tenant: PublicCommerceTenant,
    draftOrder: DraftOrder,
  ): Promise<PublicCommerceResult> {
    const resolved = await this.resolveDraftOrder.execute({
      tenantId: tenant.id,
      sessionId: draftOrder.sessionId,
      draftOrderId: draftOrder.id,
    });
    return resolved.ok
      ? { ok: true, draft: mapDraft(draftOrder, resolved.value) }
      : failureMessage(resolved.error.code);
  }
}

function mapDraft(draftOrder: DraftOrder, resolution: DraftOrderResolution): PublicCommerceDraft {
  return {
    id: draftOrder.id,
    items: draftOrder.items.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      variant: item.variant,
      quantity: item.quantity,
      unitPrice: item.resolvedPrice.amount,
      subtotal: item.subtotal.amount,
      currency: item.resolvedPrice.currency,
    })),
    summary: {
      totalQuantity: resolution.totalQuantity,
      lineCount: resolution.lineCount,
      productCount: resolution.productCount,
      subtotal: resolution.subtotal.amount,
      discount: resolution.discount.amount,
      total: resolution.total.amount,
      currency: resolution.currency,
      status: resolution.status,
      updatedAt: resolution.updatedAt,
    },
  };
}

function failureMessage(code: string): PublicCommerceResult {
  if (code === 'PRODUCT_NOT_FOUND') return { ok: false, error: 'El producto ya no esta disponible.' };
  if (code === 'PRICE_UNAVAILABLE') return { ok: false, error: 'El producto no tiene un precio publico disponible.' };
  if (code === 'INVALID_QUANTITY') return { ok: false, error: 'La cantidad indicada no es valida.' };
  if (code === 'CURRENCY_MISMATCH') return { ok: false, error: 'El producto utiliza una moneda diferente.' };
  return { ok: false, error: 'No se pudo actualizar el pedido de esta sesion.' };
}
