export type ProductStatusFilter = 'all' | 'active' | 'inactive';

export type ProductSortField = 'sku' | 'name' | 'price';

export type SortDirection = 'asc' | 'desc';

export type ProductPriceListCode = 'minorista' | 'mayorista';

export type ProductListParams = {
  search: string;
  categoryId: string;
  brandId: string;
  status: ProductStatusFilter;
  sort: ProductSortField;
  direction: SortDirection;
  page: number;
  pageSize: number;
};

export type ProductFilterOption = {
  id: string;
  name: string;
};

export type ProductListItem = {
  id: string;
  sku: string;
  productLine: string | null;
  name: string;
  variant: string | null;
  categoryId: string | null;
  categoryName: string;
  brandId: string | null;
  brandName: string;
  price: number | null;
  currency: string;
  isActive: boolean;
};

export type PaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type ProductListResult = {
  products: ProductListItem[];
  pagination: PaginationState;
  error: string | null;
};

export type ProductFiltersResult = {
  categories: ProductFilterOption[];
  brands: ProductFilterOption[];
  error: string | null;
};

export type ProductEditablePrice = {
  id: string | null;
  priceListId: string | null;
  code: ProductPriceListCode;
  name: string;
  price: number | null;
  currency: string;
  exists: boolean;
};

export type ProductDetail = {
  id: string;
  sku: string;
  productLine: string | null;
  name: string;
  variant: string | null;
  description: string | null;
  categoryId: string;
  categoryName: string;
  brandId: string;
  brandName: string;
  isActive: boolean;
  updatedAt: string;
  // TODO: conectar created_by, updated_by y change_log cuando exista auditoria formal.
  audit: {
    createdBy: string | null;
    updatedBy: string | null;
    changeLog: Array<unknown>;
  };
  prices: {
    minorista: ProductEditablePrice;
    mayorista: ProductEditablePrice | null;
  };
};

export type ProductDetailResult = {
  product: ProductDetail | null;
  error: string | null;
};

export type ProductCommandFieldErrors = Partial<
  Record<
    | 'productId'
    | 'sku'
    | 'name'
    | 'productLine'
    | 'brandId'
    | 'categoryId'
    | 'variant'
    | 'description'
    | 'isActive'
    | 'minoristaPrice'
    | 'mayoristaPrice',
    string
  >
>;

export type ProductCommandResult = {
  ok: boolean;
  affected: number;
  message: string | null;
  error: string | null;
  fieldErrors: ProductCommandFieldErrors;
  updatedAt?: string;
};

export type UpdateProductInput = {
  tenantSlug: string;
  productId: string;
  sku: string;
  name: string;
  productLine: string | null;
  brandId: string;
  categoryId: string;
  variant: string | null;
  description: string | null;
  isActive: boolean;
  minoristaPrice: number | string | null;
  mayoristaPrice?: number | string | null;
  shouldUpdateMayoristaPrice?: boolean;
};

export type NormalizedUpdateProductInput = {
  tenantSlug: string;
  productId: string;
  sku: string;
  name: string;
  productLine: string | null;
  brandId: string;
  categoryId: string;
  variant: string | null;
  description: string | null;
  isActive: boolean;
  minoristaPrice: number;
  mayoristaPrice: number | null;
  shouldUpdateMayoristaPrice: boolean;
};

export type UpdateProductPriceInput = {
  tenantSlug: string;
  productId: string;
  priceListCode: ProductPriceListCode;
  price: number | string | null;
};

export type NormalizedUpdateProductPriceInput = {
  tenantSlug: string;
  productId: string;
  priceListCode: ProductPriceListCode;
  price: number;
};

export type UpdateProductStatusInput = {
  tenantSlug: string;
  productId: string;
  isActive: boolean;
};

export type NormalizedUpdateProductStatusInput = {
  tenantSlug: string;
  productId: string;
  isActive: boolean;
};

export type ProductBulkCommand = 'activate' | 'deactivate' | 'assign-category';

export type ProductBulkCommandInput = {
  tenantSlug: string;
  productIds: string[];
  command: ProductBulkCommand;
  categoryId?: string;
};

export type ProductRelation<T> = T | T[] | null;

export type ProductPriceRow = {
  id?: string | null;
  price_list_id?: string | null;
  price: number | string | null;
  currency: string | null;
  price_lists: ProductRelation<{
    id?: string | null;
    code: string | null;
    name: string | null;
  }>;
};

export type ProductQueryRow = {
  id: string;
  sku: string;
  product_line: string | null;
  name: string;
  variant: string | null;
  description?: string | null;
  is_active: boolean;
  updated_at?: string;
  categories: ProductRelation<{
    id: string;
    name: string;
  }>;
  brands: ProductRelation<{
    id: string;
    name: string;
  }>;
  product_prices: ProductPriceRow[] | null;
};
