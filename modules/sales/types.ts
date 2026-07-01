export const SALES_ORDER_STATUSES = [
  'draft',
  'pending',
  'confirmed',
  'preparing',
  'delivered',
  'closed',
  'cancelled',
] as const;

export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export type SalesOrderStatusFilter = 'all' | SalesOrderStatus;

export type SalesListParams = {
  search: string;
  status: SalesOrderStatusFilter;
  page: number;
  pageSize: number;
};

export type SalesPaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type SalesOrderListItem = {
  id: string;
  accountId: string;
  accountName: string;
  status: SalesOrderStatus;
  priceListId: string;
  priceListName: string;
  subtotal: number;
  discount: number;
  total: number;
  itemsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SalesOrderListResult = {
  orders: SalesOrderListItem[];
  pagination: SalesPaginationState;
  error: string | null;
};

export type SalesAccountOption = {
  id: string;
  name: string;
  legalName: string | null;
  priceListId: string | null;
  priceListName: string | null;
  discountPercent: number;
};

export type SalesPriceListOption = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
};

export type SalesProductPriceOption = {
  priceListId: string;
  price: number;
  currency: string;
};

export type SalesProductOption = {
  id: string;
  sku: string;
  name: string;
  brandName: string | null;
  variant: string | null;
  productLine: string | null;
  prices: SalesProductPriceOption[];
};

export type SalesDraftOptions = {
  accounts: SalesAccountOption[];
  priceLists: SalesPriceListOption[];
  products: SalesProductOption[];
};

export type SalesDraftOptionsResult = {
  options: SalesDraftOptions;
  error: string | null;
};

export type SalesOrderItemDetail = {
  id: string;
  productId: string | null;
  skuSnapshot: string;
  productNameSnapshot: string;
  variantSnapshot: string | null;
  unitPriceSnapshot: number;
  quantity: number;
  subtotal: number;
};

export type SalesOrderDetail = {
  id: string;
  tenantName: string;
  currency: string;
  accountId: string;
  accountName: string;
  accountWhatsapp: string | null;
  status: SalesOrderStatus;
  priceListId: string;
  priceListName: string;
  subtotal: number;
  discount: number;
  total: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: SalesOrderItemDetail[];
};

export type SalesOrderDetailResult = {
  order: SalesOrderDetail | null;
  error: string | null;
};

export type SalesCommandFieldErrors = Partial<
  Record<
    | 'tenantSlug'
    | 'orderId'
    | 'accountId'
    | 'priceListId'
    | 'status'
    | 'notes'
    | 'items'
    | `item.${number}.productId`
    | `item.${number}.quantity`
    | `item.${number}.price`,
    string
  >
>;

export type SalesCommandResult = {
  ok: boolean;
  affected: number;
  message: string | null;
  error: string | null;
  fieldErrors: SalesCommandFieldErrors;
  orderId?: string;
  updatedAt?: string;
};

export type SalesOrderItemInput = {
  itemId?: string | null;
  productId: string;
  quantity: number | string | null;
};

export type SalesOrderInput = {
  tenantSlug: string;
  accountId: string;
  priceListId?: string | null;
  status: SalesOrderStatus | string;
  notes: string | null;
  items: SalesOrderItemInput[];
};

export type CreateSalesOrderInput = SalesOrderInput;

export type UpdateSalesOrderInput = SalesOrderInput & {
  orderId: string;
};

export type DuplicateSalesOrderInput = {
  tenantSlug: string;
  orderId: string;
};

export type NormalizedSalesOrderItemInput = {
  itemId: string | null;
  productId: string;
  quantity: number;
};

export type NormalizedSalesOrderInput = {
  tenantSlug: string;
  orderId?: string;
  accountId: string;
  priceListId: string | null;
  status: SalesOrderStatus;
  notes: string | null;
  items: NormalizedSalesOrderItemInput[];
};

export type SalesRelation<T> = T | T[] | null;

export type SalesOrderQueryRow = {
  id: string;
  account_id: string;
  status: string;
  price_list_id: string;
  subtotal: number | string | null;
  discount: number | string | null;
  total: number | string | null;
  notes?: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  customer_accounts: SalesRelation<{
    id: string;
    name: string | null;
    whatsapp_phone: string | null;
  }>;
  price_lists: SalesRelation<{
    id: string;
    name: string | null;
  }>;
  sales_order_items?: SalesOrderItemQueryRow[] | null;
};

export type SalesOrderItemQueryRow = {
  id: string;
  product_id: string | null;
  sku_snapshot: string;
  product_name_snapshot: string;
  variant_snapshot: string | null;
  unit_price_snapshot: number | string | null;
  quantity: number | string | null;
  subtotal: number | string | null;
};

export type SalesProductQueryRow = {
  id: string;
  sku: string;
  name: string;
  variant: string | null;
  product_line: string | null;
  brands: SalesRelation<{
    name: string | null;
  }>;
  product_prices: Array<{
    price_list_id: string | null;
    price: number | string | null;
    currency: string | null;
  }> | null;
};
