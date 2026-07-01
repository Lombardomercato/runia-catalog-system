import { supabaseServer } from '@/lib/supabaseServer';
import { getTenantIdentity } from '@/modules/tenant/queries';
import { mapPricingProduct } from './mapper';
import type {
  PricingFilterOption,
  PricingListParams,
  PricingListResult,
  PricingPagination,
  PricingPriceList,
  PricingProduct,
  PricingProductQueryRow,
} from './types';

const PRICING_PRODUCT_SELECT = `
  id,
  sku,
  name,
  variant,
  is_active,
  cost,
  cost_currency,
  brands:brand_id(id, name),
  categories:category_id(id, name),
  product_prices(
    price_list_id,
    price,
    pricing_mode,
    margin_percent_override,
    calculated_from_cost
  )
`;

export async function listPricingProducts(
  tenantSlug: string,
  params: PricingListParams,
): Promise<PricingListResult> {
  const tenantResult = await getTenantIdentity(tenantSlug);

  if (tenantResult.error || !tenantResult.tenant) {
    return emptyResult(params, tenantResult.error);
  }

  const tenantId = tenantResult.tenant.id;
  const [productsResult, priceListsResult, brandsResult, categoriesResult] = await Promise.all([
    supabaseServer
      .from('products')
      .select(PRICING_PRODUCT_SELECT)
      .eq('tenant_id', tenantId)
      .order('sku', { ascending: true }),
    supabaseServer
      .from('price_lists')
      .select('id, code, name, is_active, is_default, pricing_mode, margin_percent')
      .eq('tenant_id', tenantId)
      .in('code', ['minorista', 'mayorista'])
      .order('is_default', { ascending: false }),
    supabaseServer
      .from('brands')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name'),
    supabaseServer
      .from('categories')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order')
      .order('name'),
  ]);
  const error =
    productsResult.error?.message ??
    priceListsResult.error?.message ??
    brandsResult.error?.message ??
    categoriesResult.error?.message ??
    null;

  if (error) {
    return emptyResult(params, pricingSchemaError(error));
  }

  const priceLists = (priceListsResult.data ?? [])
    .filter((list) => list.code === 'minorista' || list.code === 'mayorista')
    .map((list): PricingPriceList => ({
      id: list.id,
      code: list.code as PricingPriceList['code'],
      name: list.name,
      isActive: list.is_active,
      isDefault: list.is_default,
      pricingMode: list.pricing_mode === 'cost_plus_percent' ? 'cost_plus_percent' : 'manual',
      marginPercent: Number(list.margin_percent ?? 0),
    }));
  const allProducts = ((productsResult.data ?? []) as PricingProductQueryRow[]).map((row) =>
    mapPricingProduct(row, priceLists),
  );
  const baseProducts = allProducts.filter((product) => matchesBaseFilters(product, params));
  const filteredProducts = baseProducts.filter((product) => matchesCoverage(product, params));
  const pagination = buildPagination(filteredProducts.length, params.page, params.pageSize);
  const start = (pagination.page - 1) * pagination.pageSize;

  return {
    products: filteredProducts.slice(start, start + pagination.pageSize),
    brands: (brandsResult.data ?? []) as PricingFilterOption[],
    categories: (categoriesResult.data ?? []) as PricingFilterOption[],
    priceLists,
    currency: tenantResult.tenant.currency,
    summary: {
      products: baseProducts.length,
      missingCost: baseProducts.filter((product) => product.cost <= 0).length,
      missingMinorista: baseProducts.filter((product) => product.minoristaPrice === null).length,
      missingMayorista: baseProducts.filter((product) => product.mayoristaPrice === null).length,
    },
    pagination,
    error: null,
  };
}

function matchesBaseFilters(product: PricingProduct, params: PricingListParams) {
  if (params.brandId !== 'all' && product.brandId !== params.brandId) return false;
  if (params.categoryId !== 'all' && product.categoryId !== params.categoryId) return false;

  const search = normalizeSearch(params.search);

  if (!search) return true;

  return normalizeSearch([product.sku, product.name, product.variant, product.brandName].filter(Boolean).join(' ')).includes(search);
}

function matchesCoverage(product: PricingProduct, params: PricingListParams) {
  if (params.coverage === 'missing_minorista') return product.minoristaPrice === null;
  if (params.coverage === 'missing_mayorista') return product.mayoristaPrice === null;
  return true;
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function buildPagination(total: number, requestedPage: number, pageSize: number): PricingPagination {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);

  return {
    page,
    pageSize,
    total,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

function emptyResult(params: PricingListParams, error: string | null): PricingListResult {
  return {
    products: [],
    brands: [],
    categories: [],
    priceLists: [],
    currency: 'ARS',
    summary: { products: 0, missingCost: 0, missingMinorista: 0, missingMayorista: 0 },
    pagination: buildPagination(0, params.page, params.pageSize),
    error,
  };
}

function pricingSchemaError(error: string) {
  if (/cost|cost_currency|pricing_mode|margin_percent|calculated_from_cost/i.test(error)) {
    return 'El Pricing Engine requiere aplicar db/migrations/006_pricing_engine.sql en Supabase.';
  }

  return error;
}
