import type { TenantExecutionContext } from '../tenant/interfaces';
import type { OrdersResult } from './errors';
import type {
  CreateDraftOrderInput,
  CreateOrderInput,
  DraftOrder,
  DraftOrderResolution,
  GetDraftOrderInput,
  Order,
  OrderListQuery,
  OrderPage,
  OrderStatus,
  RemoveDraftOrderItemInput,
  ResolveDraftOrderInput,
  UpdateDraftOrderInput,
  UpdateOrderInput,
} from './interfaces';

export interface OrdersService {
  createDraft(input: CreateDraftOrderInput): Promise<OrdersResult<DraftOrder>>;
  getDraft(input: GetDraftOrderInput): Promise<OrdersResult<DraftOrder>>;
  updateDraft(input: UpdateDraftOrderInput): Promise<OrdersResult<DraftOrder>>;
  removeDraftItem(input: RemoveDraftOrderItemInput): Promise<OrdersResult<DraftOrder>>;
  resolveDraft(input: ResolveDraftOrderInput): Promise<OrdersResult<DraftOrderResolution>>;
  create(
    context: TenantExecutionContext,
    input: CreateOrderInput,
  ): Promise<OrdersResult<Order>>;
  get(context: TenantExecutionContext, id: string): Promise<OrdersResult<Order | null>>;
  list(
    context: TenantExecutionContext,
    query?: OrderListQuery,
  ): Promise<OrdersResult<OrderPage>>;
  listByAccount(
    context: TenantExecutionContext,
    accountId: string,
    query?: Omit<OrderListQuery, 'accountId'>,
  ): Promise<OrdersResult<OrderPage>>;
  update(
    context: TenantExecutionContext,
    id: string,
    input: UpdateOrderInput,
  ): Promise<OrdersResult<Order>>;
  updateStatus(
    context: TenantExecutionContext,
    id: string,
    status: OrderStatus,
  ): Promise<OrdersResult<Order>>;
  duplicate(context: TenantExecutionContext, id: string): Promise<OrdersResult<Order>>;
}
