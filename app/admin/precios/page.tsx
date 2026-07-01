import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { listPricingProducts } from '@/modules/pricing/queries';
import { parsePricingListSearchParams } from '@/modules/pricing/validators';
import { PricingClient } from './_components/PricingClient';

export const dynamic = 'force-dynamic';

type PricingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPricingPage({ searchParams }: PricingPageProps) {
  const tenantSlug = await getCurrentTenantSlug();
  const resolvedParams = searchParams ? await searchParams : {};
  const params = parsePricingListSearchParams(resolvedParams);
  const result = await listPricingProducts(tenantSlug, params);

  return <PricingClient params={params} result={result} tenantSlug={tenantSlug} />;
}
