import type { Money } from '../pricing/interfaces';
import type { OrdersResult } from './errors';

export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'delivered'
  | 'closed'
  | 'cancelled';

export interface OrderItem {
  id: string;
  productId: string | null;
  skuSnapshot: string;
  productNameSnapshot: string;
  variantSnapshot: string | null;
  unitPriceSnapshot: Money;
  quantity: number;
  subtotal: Money;
}

export interface Order {
  id: string;
  tenantId: string;
  accountId: string;
  priceListId: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: Money;
  discount: Money;
  total: Money;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  accountId: string;
  items: CreateOrderItemInput[];
  notes?: string;
  channel: 'web' | 'whatsapp' | 'admin';
  idempotencyKey: string;
}

export interface UpdateOrderInput {
  items: CreateOrderItemInput[];
  notes: string | null;
}

export interface OrderListQuery {
  accountId?: string;
  status?: OrderStatus;
  page?: number;
  pageSize?: number;
}

export interface OrderPage {
  items: Order[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type DraftOrderStatus = 'draft';

export interface DraftOrderProductSnapshot {
  productId: string;
  sku: string;
  name: string;
  variant: string | null;
  line: string | null;
  brandName: string | null;
  categoryName: string | null;
}

export interface DraftOrderItem {
  productId: string;
  sku: string;
  name: string;
  variant: string | null;
  quantity: number;
  resolvedPrice: Money;
  subtotal: Money;
  productSnapshot: DraftOrderProductSnapshot;
}

export interface DraftOrderSummary {
  totalQuantity: number;
  subtotal: Money;
  discount: Money;
  total: Money;
}

export interface DraftOrder {
  id: string;
  tenantId: string;
  sessionId: string;
  status: DraftOrderStatus;
  currency: string;
  items: DraftOrderItem[];
  summary: DraftOrderSummary;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDraftOrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateDraftOrderInput {
  tenantId: string;
  sessionId: string;
  currency: string;
  items: CreateDraftOrderItemInput[];
}

export interface GetDraftOrderInput {
  tenantId: string;
  sessionId: string;
  draftOrderId: string;
}

export interface UpdateDraftOrderItemInput {
  productId: string;
  quantity: number;
}

export interface UpdateDraftOrderInput extends GetDraftOrderInput {
  items: UpdateDraftOrderItemInput[];
}

export interface RemoveDraftOrderItemInput extends GetDraftOrderInput {
  productId: string;
}

export type ResolveDraftOrderInput = GetDraftOrderInput;

export interface DraftOrderResolution {
  draftOrderId: string;
  totalQuantity: number;
  lineCount: number;
  productCount: number;
  subtotal: Money;
  discount: Money;
  total: Money;
  currency: string;
  status: DraftOrderStatus;
  updatedAt: string;
}

export interface ResolvedDraftOrderProduct {
  productSnapshot: DraftOrderProductSnapshot;
  publicPrice: Money;
}

export type DraftOrderProductResolution =
  | { status: 'available'; product: ResolvedDraftOrderProduct }
  | { status: 'product_not_found'; productId: string }
  | { status: 'price_unavailable'; productId: string };

export interface DraftOrderProductResolver {
  resolvePublicProduct(
    tenantId: string,
    productId: string,
  ): Promise<DraftOrderProductResolution>;
}

export interface DraftOrderRepository {
  save(draftOrder: DraftOrder): Promise<void>;
  findById(input: GetDraftOrderInput): Promise<DraftOrder | null>;
}

export interface DraftOrderRuntime {
  createId(): string;
  now(): string;
}

export interface DraftOrderReader {
  execute(input: GetDraftOrderInput): Promise<OrdersResult<DraftOrder>>;
}
