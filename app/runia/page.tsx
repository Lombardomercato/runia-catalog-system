import { listTenants } from '@/modules/tenants/queries';
import { RuniaTenantsPanel } from './_components/RuniaTenantsPanel';

export const dynamic = 'force-dynamic';

export default async function RuniaConsolePage() {
  const result = await listTenants();

  return <RuniaTenantsPanel result={result} />;
}
