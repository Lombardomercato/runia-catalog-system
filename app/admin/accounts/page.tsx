import { getAccountFilterOptions, listAccounts } from '@/modules/accounts/queries';
import { parseAccountListSearchParams } from '@/modules/accounts/validators';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { AccountsClient } from './_components/AccountsClient';

export const dynamic = 'force-dynamic';

type AccountsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminAccountsPage({ searchParams }: AccountsPageProps) {
  const tenantSlug = await getCurrentTenantSlug();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const params = parseAccountListSearchParams(resolvedSearchParams);
  const [result, filters] = await Promise.all([
    listAccounts(tenantSlug, params),
    getAccountFilterOptions(tenantSlug),
  ]);

  return <AccountsClient filters={filters} params={params} result={result} />;
}
