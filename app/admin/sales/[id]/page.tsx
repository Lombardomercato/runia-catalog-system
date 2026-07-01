import Link from 'next/link';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { getSalesDraftOptions, getSalesOrderById } from '@/modules/sales/queries';
import { SalesOrderForm } from '../_components/SalesOrderForm';

export const dynamic = 'force-dynamic';

type SalesEditPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminSalesEditPage({ params }: SalesEditPageProps) {
  const tenantSlug = await getCurrentTenantSlug();
  const { id } = await params;
  const [orderResult, options] = await Promise.all([
    getSalesOrderById(tenantSlug, id),
    getSalesDraftOptions(tenantSlug),
  ]);

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
