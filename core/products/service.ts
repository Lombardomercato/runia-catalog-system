import type { TenantExecutionContext } from '../tenant/interfaces';
import type { ProductsResult } from './errors';
import type {
  FeaturedProductsQuery,
  GetPublicProductBySkuInput,
  GetPublicProductBySkuOutput,
  ListPublicProductsInput,
  ListPublicProductsOutput,
  Product,
  ProductListQuery,
  ProductPage,
  ProductWriteInput,
} from './interfaces';

export interface ProductsService {
  listPublic(input: ListPublicProductsInput): Promise<ProductsResult<ListPublicProductsOutput>>;
  getPublicBySku(
    input: GetPublicProductBySkuInput,
  ): Promise<ProductsResult<GetPublicProductBySkuOutput>>;
  list(
    context: TenantExecutionContext,
    query?: ProductListQuery,
  ): Promise<ProductsResult<ProductPage>>;
  getById(context: TenantExecutionContext, id: string): Promise<ProductsResult<Product | null>>;
  getBySku(context: TenantExecutionContext, sku: string): Promise<ProductsResult<Product | null>>;
  search(
    context: TenantExecutionContext,
    query: string,
    filters?: ProductListQuery,
  ): Promise<ProductsResult<ProductPage>>;
  featured(
    context: TenantExecutionContext,
    query?: FeaturedProductsQuery,
  ): Promise<ProductsResult<Product[]>>;
  create(
    context: TenantExecutionContext,
    input: ProductWriteInput,
  ): Promise<ProductsResult<Product>>;
  update(
    context: TenantExecutionContext,
    id: string,
    input: ProductWriteInput,
  ): Promise<ProductsResult<Product>>;
  setActive(
    context: TenantExecutionContext,
    id: string,
    active: boolean,
  ): Promise<ProductsResult<Product>>;
}
