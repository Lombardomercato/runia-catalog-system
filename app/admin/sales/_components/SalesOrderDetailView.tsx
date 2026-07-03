import Link from 'next/link';
import type { AccountLinkOption } from '@/modules/accounts/types';
import type { SalesOrderDetail, SalesOrderStatus } from '@/modules/sales/types';
import { SalesOrderAccountLinker } from './SalesOrderAccountLinker';
import { SalesOrderDetailActions } from './SalesOrderDetailActions';

type SalesOrderDetailViewProps = {
  order: SalesOrderDetail;
  tenantSlug: string;
  accountOptions: AccountLinkOption[];
  accountsError: string | null;
};

const statusLabels: Record<SalesOrderStatus, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'En preparacion',
  delivered: 'Entregado',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
};

export function SalesOrderDetailView({
  order,
  tenantSlug,
  accountOptions,
  accountsError,
}: SalesOrderDetailViewProps) {
  const money = (value: number) => formatMoney(value, order.currency);

  return (
    <main className="sales-edit-page">
      <header className="admin-header sales-header">
        <p className="admin-kicker">Motor comercial</p>
        <div className="admin-header-row">
          <div>
            <div className="sales-detail-title-row">
              <h1 className="admin-title">Pedido {shortId(order.id)}</h1>
              <span className="sales-status" data-status={order.status}>
                {statusLabels[order.status]}
              </span>
            </div>
            <p className="admin-subtitle">
              {formatDateTime(order.createdAt)} · {sourceLabel(order.source)}
            </p>
          </div>
          <Link className="product-edit-secondary-link" href="/admin/sales">
            Volver al listado
          </Link>
        </div>
      </header>

      <div className="sales-detail-layout">
        <div className="sales-order-flow">
          {!order.accountId && order.hasPublicIdentity ? (
            <SalesOrderAccountLinker
              accounts={accountOptions}
              accountsError={accountsError}
              order={order}
              tenantSlug={tenantSlug}
            />
          ) : null}

          <section className="product-edit-panel">
            <div className="product-edit-panel-header"><span>Cliente</span></div>
            <dl className="sales-detail-data">
              <DetailRow label={order.accountId ? 'Account' : 'Identidad publica'} value={order.accountName} />
              <DetailRow label="Empresa" value={order.customerCompany} />
              <DetailRow label="WhatsApp" value={order.accountWhatsapp} />
              <DetailRow label="Email" value={order.customerEmail} />
              <DetailRow label="CUIT" value={order.customerTaxId} />
              <DetailRow label="Origen" value={sourceLabel(order.source)} />
              <DetailRow label="Lista de precios" value={order.priceListName} />
            </dl>
          </section>

          <section className="product-edit-panel">
            <div className="product-edit-panel-header"><span>Historial del pedido</span></div>
            <ol className="sales-timeline">
              {order.timeline.map((entry) => (
                <li data-state={entry.state} key={entry.key}>
                  <span aria-hidden="true" />
                  <div>
                    <strong>{entry.label}</strong>
                    <small>
                      {entry.occurredAt
                        ? `${formatDateTime(entry.occurredAt)}${entry.inferred ? ' · estado inferido' : ''}`
                        : entry.state === 'pending' ? 'Pendiente' : 'Sin fecha registrada'}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="product-edit-panel">
            <div className="product-edit-panel-header sales-items-heading">
              <span>Productos</span>
              <strong>{order.items.length}</strong>
            </div>
            <div className="sales-detail-items">
              {order.items.map((item) => (
                <article className="sales-detail-item" key={item.id}>
                  <div>
                    <strong>{item.productNameSnapshot}</strong>
                    <span>{item.variantSnapshot ?? 'Sin variante'}</span>
                  </div>
                  <div><span>SKU</span><strong>{item.skuSnapshot}</strong></div>
                  <div><span>Cantidad</span><strong>{formatQuantity(item.quantity)}</strong></div>
                  <div><span>Unitario</span><strong>{money(item.unitPriceSnapshot)}</strong></div>
                  <div><span>Subtotal</span><strong>{money(item.subtotal)}</strong></div>
                </article>
              ))}
            </div>
          </section>

          <section className="product-edit-panel">
            <div className="product-edit-panel-header"><span>Observaciones</span></div>
            <p className="sales-detail-notes">{order.notes ?? 'Sin observaciones.'}</p>
          </section>
        </div>

        <aside className="sales-summary-column">
          <section className="product-edit-panel product-edit-side sales-total-panel">
            <div className="product-edit-panel-header"><span>Resumen</span></div>
            <div className="sales-total-line"><span>Subtotal</span><strong>{money(order.subtotal)}</strong></div>
            <div className="sales-total-line"><span>Descuento</span><strong>{money(order.discount)}</strong></div>
            <div className="sales-total-line sales-total-line-final"><span>Total</span><strong>{money(order.total)}</strong></div>
            <SalesOrderDetailActions order={order} tenantSlug={tenantSlug} />
          </section>
        </aside>
      </div>
    </main>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return <div><dt>{label}</dt><dd>{value ?? 'No informado'}</dd></div>;
}

function sourceLabel(source: SalesOrderDetail['source']) {
  return source === 'public_commerce' ? 'Public Commerce' : 'Admin';
}

function shortId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
