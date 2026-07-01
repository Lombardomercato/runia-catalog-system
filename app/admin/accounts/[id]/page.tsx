import Link from 'next/link';
import { getAccountById, getAccountFilterOptions } from '@/modules/accounts/queries';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { AccountForm } from '../_components/AccountForm';

export const dynamic = 'force-dynamic';

type AccountEditPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminAccountEditPage({ params }: AccountEditPageProps) {
  const tenantSlug = await getCurrentTenantSlug();
  const { id } = await params;
  const [accountResult, filters] = await Promise.all([
    getAccountById(tenantSlug, id),
    getAccountFilterOptions(tenantSlug),
  ]);

  if (accountResult.error || !accountResult.account) {
    return (
      <main className="account-edit-page">
        <header className="admin-header product-edit-header">
          <p className="admin-kicker">Account</p>
          <h1 className="admin-title">No encontrada</h1>
        </header>

        <section className="products-state products-state-error">
          <strong>No se pudo cargar la account.</strong>
          <p>{accountResult.error}</p>
          <Link className="product-edit-secondary-link" href="/admin/accounts">
            Volver al listado
          </Link>
        </section>
      </main>
    );
  }

  return (
    <AccountForm
      account={accountResult.account}
      filtersError={filters.error}
      mode="edit"
      priceLists={filters.priceLists}
      tenantSlug={tenantSlug}
    />
  );
}
