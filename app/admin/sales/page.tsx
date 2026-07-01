import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { listSalesOrders } from '@/modules/sales/queries';
import { parseSalesListSearchParams } from '@/modules/sales/validators';
import { SalesClient } from './_components/SalesClient';

export const dynamic = 'force-dynamic';

type SalesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminSalesPage({ searchParams }: SalesPageProps) {
  const tenantSlug = await getCurrentTenantSlug();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const params = parseSalesListSearchParams(resolvedSearchParams);
  const result = await listSalesOrders(tenantSlug, params);

  return <SalesClient params={params} result={result} tenantSlug={tenantSlug} />;
}
