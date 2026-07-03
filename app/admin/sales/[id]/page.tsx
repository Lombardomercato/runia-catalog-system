import Link from 'next/link';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { getLinkableAccountOptions } from '@/modules/accounts/queries';
import { getSalesDraftOptions, getSalesOrderById } from '@/modules/sales/queries';
import { SalesOrderForm } from '../_components/SalesOrderForm';
import { SalesOrderDetailView } from '../_components/SalesOrderDetailView';

export const dynamic = 'force-dynamic';

type SalesEditPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminSalesEditPage({ params, searchParams }: SalesEditPageProps) {
  const tenantSlug = await getCurrentTenantSlug();
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const editRequested = readParam(resolvedSearchParams.edit) === '1';
  const orderResult = await getSalesOrderById(tenantSlug, id);

  if (orderResult.error || !orderResult.order) {
    return (
      <main className="sales-edit-page">
        <header className="admin-header sales-header">
          <p className="admin-kicker">Motor comercial</p>
          <h1 className="admin-title">No encontrado</h1>
        </header>

        <section className="products-state products-state-error">
          <strong>No se pudo cargar el pedido.</strong>
          <p>{orderResult.error}</p>
          <Link className="product-edit-secondary-link" href="/admin/sales">
            Volver al listado
          </Link>
        </section>
      </main>
    );
  }

  if (!editRequested || !orderResult.order.accountId) {
    const accountOptions = orderResult.order.accountId || !orderResult.order.hasPublicIdentity
      ? { accounts: [], error: null }
      : await getLinkableAccountOptions(tenantSlug);
    return (
      <SalesOrderDetailView
        accountOptions={accountOptions.accounts}
        accountsError={accountOptions.error}
        order={orderResult.order}
        tenantSlug={tenantSlug}
      />
    );
  }

  const options = await getSalesDraftOptions(tenantSlug);

  return (
    <SalesOrderForm
      mode="edit"
      options={options.options}
      optionsError={options.error}
      order={orderResult.order}
      tenantSlug={tenantSlug}
    />
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
