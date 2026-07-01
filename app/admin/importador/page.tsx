import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { listRecentImports } from '@/modules/imports/queries';
import { ImportCatalogClient } from './_components/ImportCatalogClient';

export const dynamic = 'force-dynamic';

export default async function AdminImportadorPage() {
  const tenantSlug = await getCurrentTenantSlug();
  const history = await listRecentImports(tenantSlug);

  return <ImportCatalogClient history={history} tenantSlug={tenantSlug} />;
}
