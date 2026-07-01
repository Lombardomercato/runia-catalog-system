import { GetPublicProductBySku } from '@/core/products/use-cases/GetPublicProductBySku';
import { ListPublicProducts } from '@/core/products/use-cases/ListPublicProducts';
import { ResolvePublicPrice } from '@/core/pricing/use-cases/ResolvePublicPrice';
import { GetPublicTenantConfig } from '@/core/tenant/use-cases/GetPublicTenantConfig';
import { mapPublicProductOutput, mapPublicProductsOutput } from './mapper';
import { SupabasePublicProductsRepository } from './repositories/SupabasePublicProductsRepository';
import { SupabasePublicTenantRepository } from '@/modules/tenant/repositories/SupabasePublicTenantRepository';
import type {
  CatalogListParams,
  CatalogListResult,
  CatalogProductResult,
} from './types';

const publicProductsRepository = new SupabasePublicProductsRepository();
const publicTenantRepository = new SupabasePublicTenantRepository();
const resolvePublicPrice = new ResolvePublicPrice();
const getPublicTenantConfig = new GetPublicTenantConfig(
  publicTenantRepository,
  resolvePublicPrice,
);
const listPublicProducts = new ListPublicProducts(
  publicProductsRepository,
  resolvePublicPrice,
  getPublicTenantConfig,
);
const getPublicProductBySku = new GetPublicProductBySku(
  publicProductsRepository,
  resolvePublicPrice,
  getPublicTenantConfig,
);

export async function getPublicCatalog(
  tenantSlug: string,
  params: CatalogListParams,
): Promise<CatalogListResult> {
  const result = await listPublicProducts.execute({
    tenantSlug,
    search: params.search,
    categoryId: params.categoryId === 'all' ? undefined : params.categoryId,
    brandId: params.brandId === 'all' ? undefined : params.brandId,
    sort: params.sort,
    page: 1,
    pageSize: 100,
  });
  if (!result.ok) return emptyCatalog(publicProductsErrorMessage(result.error.code));
  return { ...mapPublicProductsOutput(result.value), error: null };
}

export async function getPublicCatalogProductBySku(
  tenantSlug: string,
  sku: string,
): Promise<CatalogProductResult> {
  const result = await getPublicProductBySku.execute({ tenantSlug, sku });
  if (!result.ok) {
    const notFound = result.error.code === 'PRODUCT_NOT_FOUND';
    return {
      tenant: null,
      product: null,
      notFound,
      error: notFound ? null : publicProductsErrorMessage(result.error.code),
    };
  }
  return { ...mapPublicProductOutput(result.value), notFound: false, error: null };
}

function emptyCatalog(error: string | null): CatalogListResult {
  return {
    tenant: null,
    products: [],
    categories: [],
    brands: [],
    totalProducts: 0,
    error,
  };
}

function publicProductsErrorMessage(code: string) {
  if (code === 'TENANT_NOT_FOUND') return 'No se encontro el cliente solicitado.';
  if (code === 'TENANT_INACTIVE') return 'El cliente no esta activo.';
  if (code === 'PUBLIC_CATALOG_DISABLED') return 'El catalogo publico no esta disponible.';
  if (code === 'PUBLIC_PRICE_LIST_NOT_FOUND') return 'No hay una lista de precios publica activa.';
  if (code === 'INVALID_INPUT') return 'Los filtros del catalogo no son validos.';
  return 'No se pudo cargar el catalogo.';
}
