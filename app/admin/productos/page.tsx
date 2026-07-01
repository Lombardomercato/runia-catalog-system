import { getProductFilterOptions, listProducts } from '@/modules/products/queries';
import { parseProductListSearchParams } from '@/modules/products/validators';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { ProductsClient } from './_components/ProductsClient';

export const dynamic = 'force-dynamic';

type ProductPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProductosPage({ searchParams }: ProductPageProps) {
  const tenantSlug = await getCurrentTenantSlug();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const params = parseProductListSearchParams(resolvedSearchParams);
  const [result, filters] = await Promise.all([
    listProducts(tenantSlug, params),
    getProductFilterOptions(tenantSlug),
  ]);

  return <ProductsClient filters={filters} params={params} result={result} />;
}
