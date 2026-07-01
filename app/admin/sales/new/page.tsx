import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { getSalesDraftOptions } from '@/modules/sales/queries';
import { SalesOrderForm } from '../_components/SalesOrderForm';

export const dynamic = 'force-dynamic';

export default async function AdminSalesNewPage() {
  const tenantSlug = await getCurrentTenantSlug();
  const options = await getSalesDraftOptions(tenantSlug);

  return (
    <SalesOrderForm
      mode="create"
      options={options.options}
      optionsError={options.error}
      order={null}
      tenantSlug={tenantSlug}
    />
  );
}
