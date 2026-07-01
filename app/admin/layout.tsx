import type { ReactNode } from 'react';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { getWorkspaceSidebarIndicators } from '@/modules/workspace/queries';
import type { WorkspaceSidebarIndicators } from '@/modules/workspace/types';
import { AdminShell } from './_components/AdminShell';

export const dynamic = 'force-dynamic';

const emptyIndicators: WorkspaceSidebarIndicators = {
  products: null,
  accounts: null,
  sales: null,
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const indicators = await loadSidebarIndicators();

  return <AdminShell indicators={indicators}>{children}</AdminShell>;
}

async function loadSidebarIndicators() {
  try {
    return await getWorkspaceSidebarIndicators(await getCurrentTenantSlug());
  } catch {
    return emptyIndicators;
  }
}
