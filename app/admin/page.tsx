import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { getCommercialWorkspace } from '@/modules/workspace/queries';
import { CommercialWorkspace } from './_components/CommercialWorkspace';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const tenantSlug = await getCurrentTenantSlug();
  const workspace = await getCommercialWorkspace(tenantSlug);

  return <CommercialWorkspace workspace={workspace} />;
}
