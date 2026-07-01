import { getAccountFilterOptions } from '@/modules/accounts/queries';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { AccountForm } from '../_components/AccountForm';

export const dynamic = 'force-dynamic';

export default async function AdminAccountCreatePage() {
  const tenantSlug = await getCurrentTenantSlug();
  const filters = await getAccountFilterOptions(tenantSlug);

  return (
    <AccountForm
      account={null}
      filtersError={filters.error}
      mode="create"
      priceLists={filters.priceLists}
      tenantSlug={tenantSlug}
    />
  );
}
