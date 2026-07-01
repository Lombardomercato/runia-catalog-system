import { supabaseServer } from '@/lib/supabaseServer';
import { getTenantIdentity } from '@/modules/tenant/queries';
import {
  mapProductRowToDetail,
  mapProductRowToListItem,
  sortProductListItems,
} from './mapper';
import type {
  PaginationState,
  ProductDetailResult,
  ProductFilterOption,
  ProductFiltersResult,
  ProductListParams,
  ProductListResult,
  ProductQueryRow,
} from './types';

const PRODUCT_SELECT = `
  id,
  sku,
  product_line,
  name,
  variant,
  description,
  is_active,
  updated_at,
  categories:category_id(id, name),
  brands:brand_id(id, name),
  product_prices(
    id,
    price_list_id,
    price,
    currency,
    price_lists:price_list_id(id, code, name)
  )
`;

const EMPTY_PAGINATION: PaginationState = {
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 1,
  hasPrevious: false,
  hasNext: false,
};

export async function listProducts(
  tenantSlug: string,
  params: ProductListParams,
): Promise<ProductListResult> {
  const tenantResult = await getProductTenant(tenantSlug);

  if (tenantResult.error || !tenantResult.tenant) {
    return emptyProductList(params, tenantResult.error);
  }

  let query = supabaseServer
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('tenant_id', tenantResult.tenant.id);

  if (params.status === 'active') {
    query = query.eq('is_active', true);
  }

  if (params.status === 'inactive') {
    query = query.eq('is_active', false);
  }

  if (params.categoryId !== 'all') {
    query = query.eq('category_id', params.categoryId);
  }

  if (params.brandId !== 'all') {
    query = query.eq('brand_id', params.brandId);
  }

  const search = normalizeSearchTerm(params.search);

  if (search) {
    query = query.or(
      `sku.ilike.%${search}%,name.ilike.%${search}%,variant.ilike.%${search}%,product_line.ilike.%${search}%`,
    );
  }

  const { data, error } = await query;

  if (error) {
    return emptyProductList(params, error.message);
  }

  const products = sortProductListItems(
    ((data ?? []) as ProductQueryRow[]).map(mapProductRowToListItem),
    params.sort,
    params.direction,
  );
  const pagination = buildPagination(products.length, params.page, params.pageSize);
  const start = (pagination.page - 1) * pagination.pageSize;

  return {
    products: products.slice(start, start + pagination.pageSize),
    pagination,
    error: null,
  };
}

export async function getProductFilterOptions(
  tenantSlug: string,
): Promise<ProductFiltersResult> {
  const tenantResult = await getProductTenant(tenantSlug);

  if (tenantResult.error || !tenantResult.tenant) {
    return {
      categories: [],
      brands: [],
      error: tenantResult.error,
    };
  }

  const [categories, brands] = await Promise.all([
    supabaseServer
      .from('categories')
      .select('id, name')
      .eq('tenant_id', tenantResult.tenant.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabaseServer
      .from('brands')
      .select('id, name')
      .eq('tenant_id', tenantResult.tenant.id)
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ]);

  const firstError = categories.error?.message ?? brands.error?.message ?? null;

  return {
    categories: ((categories.data ?? []) as ProductFilterOption[]),
    brands: ((brands.data ?? []) as ProductFilterOption[]),
    error: firstError,
  };
}

export async function getProductById(
  tenantSlug: string,
  productId: string,
): Promise<ProductDetailResult> {
  const tenantResult = await getProductTenant(tenantSlug);

  if (tenantResult.error || !tenantResult.tenant) {
    return {
      product: null,
      error: tenantResult.error,
    };
  }

  const { data, error } = await supabaseServer
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('id', productId)
    .single();

  if (error || !data) {
    return {
      product: null,
      error: `No se encontro el producto solicitado.`,
    };
  }

  return {
    product: mapProductRowToDetail(data as ProductQueryRow),
    error: null,
  };
}

export async function countActiveProductsByTenantId(tenantId: string) {
  const { count, error } = await supabaseServer
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  return {
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

async function getProductTenant(tenantSlug: string) {
  const result = await getTenantIdentity(tenantSlug);

  if (result.error || !result.tenant) {
    return {
      tenant: null,
      error: result.error,
    };
  }

  return {
    tenant: result.tenant,
    error: null,
  };
}

function emptyProductList(params: ProductListParams, error: string | null): ProductListResult {
  return {
    products: [],
    pagination: {
      ...EMPTY_PAGINATION,
      pageSize: params.pageSize,
    },
    error,
  };
}

function buildPagination(total: number, requestedPage: number, pageSize: number): PaginationState {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), totalPages);

  return {
    page,
    pageSize,
    total,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

function normalizeSearchTerm(value: string) {
  return value.trim().replace(/[%,()_]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
}
