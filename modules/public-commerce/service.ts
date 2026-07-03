import { CreateDraftOrder } from '@/core/orders/use-cases/CreateDraftOrder';
import { ConfirmDraftOrder } from '@/core/orders/use-cases/ConfirmDraftOrder';
import { CreateSalesOrderFromDraft } from '@/core/orders/use-cases/CreateSalesOrderFromDraft';
import { GetDraftOrder } from '@/core/orders/use-cases/GetDraftOrder';
import { RemoveDraftOrderItem } from '@/core/orders/use-cases/RemoveDraftOrderItem';
import { PrepareDraftCheckout } from '@/core/orders/use-cases/PrepareDraftCheckout';
import { ResolveDraftOrder } from '@/core/orders/use-cases/ResolveDraftOrder';
import { UpdateDraftOrder } from '@/core/orders/use-cases/UpdateDraftOrder';
import { ValidateDraftIdentity } from '@/core/orders/use-cases/ValidateDraftIdentity';
import type { DraftOrder, DraftOrderResolution } from '@/core/orders/interfaces';
import type { OrdersDomainError } from '@/core/orders/errors';
import { SystemDraftOrderRuntime } from '@/modules/orders/runtime/SystemDraftOrderRuntime';
import { PublicCommerceProductResolver } from './PublicCommerceProductResolver';
import { HttpSalesOrderFromDraftRepository } from './repositories/HttpSalesOrderFromDraftRepository';
import { SessionStorageDraftOrderRepository } from './SessionStorageDraftOrderRepository';
import { requestPublicSalesOrderWhatsApp } from './whatsapp';
import type {
  PublicCommerceDraft,
  PublicCommerceIdentityInput,
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
  private readonly prepareDraftCheckout: PrepareDraftCheckout;
  private readonly confirmDraftOrder: ConfirmDraftOrder;
  private readonly createSalesOrderFromDraft: CreateSalesOrderFromDraft;

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
    const identityValidator = new ValidateDraftIdentity();
    this.prepareDraftCheckout = new PrepareDraftCheckout(
      this.getDraftOrder,
      this.repository,
      this.runtime,
      identityValidator,
    );
    this.confirmDraftOrder = new ConfirmDraftOrder(
      this.getDraftOrder,
      this.resolveDraftOrder,
      this.repository,
      this.runtime,
      identityValidator,
    );
    this.createSalesOrderFromDraft = new CreateSalesOrderFromDraft(
      this.getDraftOrder,
      this.confirmDraftOrder,
      this.repository,
      new HttpSalesOrderFromDraftRepository(),
      this.runtime,
    );
  }

  async getSessionDraft(tenant: PublicCommerceTenant): Promise<PublicCommerceResult> {
    const active = await this.loadActiveDraft(tenant);
    if (!active) return { ok: true, draft: null };
    const result = await this.toResult(tenant, active);
    return active.status === 'submitted' && result.ok
      ? this.attachWhatsAppReceipt(tenant, active, result)
      : result;
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

  async prepareIdentity(
    tenant: PublicCommerceTenant,
    identity: PublicCommerceIdentityInput,
  ): Promise<PublicCommerceResult> {
    const active = await this.loadActiveDraft(tenant);
    if (!active) return { ok: false, error: 'No hay un pedido activo en esta sesion.' };
    const prepared = await this.prepareDraftCheckout.execute({
      tenantId: tenant.id,
      sessionId: active.sessionId,
      draftOrderId: active.id,
      identity,
    });
    return prepared.ok
      ? this.toResult(tenant, prepared.value)
      : failureFromDomain(prepared.error);
  }

  async confirmDraft(tenant: PublicCommerceTenant): Promise<PublicCommerceResult> {
    const active = await this.loadActiveDraft(tenant);
    if (!active) return { ok: false, error: 'No hay un pedido activo en esta sesion.' };
    const confirmed = await this.confirmDraftOrder.execute({
      tenantId: tenant.id,
      sessionId: active.sessionId,
      draftOrderId: active.id,
    });
    return confirmed.ok
      ? this.toResult(tenant, confirmed.value.draftOrder)
      : failureFromDomain(confirmed.error);
  }

  async submitDraft(tenant: PublicCommerceTenant): Promise<PublicCommerceResult> {
    const active = await this.loadActiveDraft(tenant);
    if (!active) return { ok: false, error: 'No hay un pedido activo en esta sesion.' };
    if (!tenant.priceList) {
      return { ok: false, error: 'No hay una lista publica disponible para crear el pedido.' };
    }
    const submitted = await this.createSalesOrderFromDraft.execute({
      tenantId: tenant.id,
      sessionId: active.sessionId,
      draftOrderId: active.id,
      idempotencyKey: publicOrderIdempotencyKey(tenant.id, active),
      commercial: {
        tenantName: tenant.commercialName,
        priceListId: tenant.priceList.id,
        priceListCode: tenant.priceList.code,
        priceListName: tenant.priceList.name,
        currency: tenant.currency,
        channel: 'public_commerce',
      },
    });
    if (!submitted.ok) return failureFromDomain(submitted.error);
    const result = await this.toResult(tenant, submitted.value.draftOrder);
    if (!result.ok) return result;
    return this.attachWhatsAppReceipt(tenant, submitted.value.draftOrder, {
      ...result,
      salesOrderId: submitted.value.order.id,
      salesOrderCreated: submitted.value.created,
    });
  }

  private async attachWhatsAppReceipt(
    tenant: PublicCommerceTenant,
    draftOrder: DraftOrder,
    result: Extract<PublicCommerceResult, { ok: true }>,
  ): Promise<PublicCommerceResult> {
    const whatsapp = await requestPublicSalesOrderWhatsApp({
      tenantId: tenant.id,
      sourceDraftId: draftOrder.id,
      idempotencyKey: publicOrderIdempotencyKey(tenant.id, draftOrder),
      locale: tenant.locale,
    });
    return {
      ...result,
      ...(whatsapp.receipt
        ? { salesOrderId: whatsapp.receipt.orderId, whatsappReceipt: whatsapp.receipt }
        : { whatsappError: whatsapp.error }),
    };
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

function publicOrderIdempotencyKey(tenantId: string, draftOrder: DraftOrder) {
  return `public-commerce:${tenantId}:${draftOrder.id}:${draftOrder.sessionId}`;
}

function mapDraft(draftOrder: DraftOrder, resolution: DraftOrderResolution): PublicCommerceDraft {
  return {
    id: draftOrder.id,
    status: draftOrder.status,
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
    identity: draftOrder.identity,
  };
}

function failureMessage(code: string): PublicCommerceResult {
  if (code === 'PRODUCT_NOT_FOUND') return { ok: false, error: 'El producto ya no esta disponible.' };
  if (code === 'PRICE_UNAVAILABLE') return { ok: false, error: 'El producto no tiene un precio publico disponible.' };
  if (code === 'INVALID_QUANTITY') return { ok: false, error: 'La cantidad indicada no es valida.' };
  if (code === 'CURRENCY_MISMATCH') return { ok: false, error: 'El producto utiliza una moneda diferente.' };
  return { ok: false, error: 'No se pudo actualizar el pedido de esta sesion.' };
}

function failureFromDomain(error: OrdersDomainError): PublicCommerceResult {
  if (error.code === 'DRAFT_ORDER_NOT_READY') {
    return { ok: false, error: 'El pedido aun no esta completo para confirmar.' };
  }
  if (error.code === 'INVALID_STATUS_TRANSITION') {
    return { ok: false, error: 'El pedido no esta en un estado valido para continuar.' };
  }
  if (error.code === 'IDEMPOTENCY_CONFLICT') {
    return { ok: false, error: 'La solicitud ya fue utilizada para otro pedido.' };
  }
  if (error.code !== 'INVALID_DRAFT_IDENTITY') return failureMessage(error.code);
  const labels: Record<string, string> = {
    name: 'Ingresá un nombre válido.',
    company: 'La empresa es demasiado extensa.',
    whatsapp: 'Ingresá un WhatsApp válido.',
    email: 'Ingresá un email válido.',
    cuit: 'Ingresá un CUIT con formato válido.',
    notes: 'Las observaciones son demasiado extensas.',
  };
  return {
    ok: false,
    error: 'Revisá los datos ingresados.',
    fieldErrors: Object.fromEntries(
      Object.keys(error.fieldErrors ?? {}).map((field) => [field, labels[field] ?? 'Dato inválido.']),
    ),
  };
}
