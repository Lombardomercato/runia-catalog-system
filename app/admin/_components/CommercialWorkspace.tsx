import Link from 'next/link';
import {
  formatWorkspaceDate,
  workspaceStatusLabel,
} from '@/modules/workspace/mapper';
import type {
  CommercialWorkspace as CommercialWorkspaceData,
  WorkspaceMetric,
} from '@/modules/workspace/types';

type CommercialWorkspaceProps = { workspace: CommercialWorkspaceData };

const quickActions = [
  { label: 'Nuevo Pedido', href: '/admin/sales/new', description: 'Crear una orden comercial.', primary: true },
  { label: 'Nueva Account', href: '/admin/accounts/new', description: 'Cargar una cuenta comercial.', primary: false },
  { label: 'Nuevo Producto', href: '/admin/productos', description: 'Abrir gestion de productos.', primary: false },
  { label: 'Importar Catalogo', href: '/admin/importador', description: 'Procesar una carga masiva.', primary: false },
  { label: 'Ver Pedidos', href: '/admin/sales', description: 'Revisar el pipeline comercial.', primary: false },
] as const;

export function CommercialWorkspace({ workspace }: CommercialWorkspaceProps) {
  const currency = workspace.tenant?.currency ?? 'ARS';
  return (
    <main className="workspace-page">
      <header className="admin-header workspace-header">
        <p className="admin-kicker">{workspace.tenant?.slug ?? 'tenant no disponible'}</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Commercial Workspace</h1>
            <p className="admin-subtitle">Resumen comercial y prioridades de la operacion diaria.</p>
          </div>
          <span className="admin-status">Datos reales</span>
        </div>
      </header>

      {workspace.errors.length > 0 ? (
        <section className="admin-error workspace-alert">
          <strong>Hay datos no disponibles.</strong>
          <p>Los bloques afectados quedan identificados sin bloquear el resto del workspace.</p>
        </section>
      ) : null}

      <section className="workspace-section" aria-labelledby="metrics-title">
        <div className="workspace-section-heading">
          <span>Comercial</span>
          <h2 id="metrics-title">Metricas principales</h2>
        </div>
        <div className="workspace-commercial-grid">
          {workspace.summary.map((metric) => (
            <MetricCard currency={currency} key={metric.key} metric={metric} variant="summary" />
          ))}
        </div>
      </section>

      <section className="workspace-section" aria-labelledby="pending-title">
        <div className="workspace-section-heading">
          <span>Prioridad</span>
          <h2 id="pending-title">Trabajo pendiente</h2>
        </div>
        <div className="workspace-pending-grid">
          {workspace.pending.map((metric) => (
            <MetricCard currency={currency} key={metric.key} metric={metric} variant="pending" />
          ))}
        </div>
      </section>

      <section className="workspace-two-column">
        <section className="workspace-section" aria-labelledby="recent-orders-title">
          <div className="workspace-section-heading">
            <span>Ventas</span>
            <h2 id="recent-orders-title">Ultimos pedidos</h2>
          </div>
          {workspace.recentOrdersError ? (
            <WorkspaceError label="Pedidos no disponibles" />
          ) : workspace.recentOrders.length > 0 ? (
            <div className="workspace-orders-list">
              {workspace.recentOrders.map((order) => (
                <Link className="workspace-order-item" href={`/admin/sales/${order.id}`} key={order.id}>
                  <div>
                    <strong>{order.customerName}</strong>
                    <span>{formatWorkspaceDate(order.createdAt)}</span>
                  </div>
                  <div>
                    <strong>{formatMoney(order.total, order.currency)}</strong>
                    <span className="sales-status" data-status={order.status}>
                      {workspaceStatusLabel(order.status)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <WorkspaceEmpty label="Sin pedidos registrados" />
          )}
        </section>

        <section className="workspace-section" aria-labelledby="activity-title">
          <div className="workspace-section-heading">
            <span>Auditoria</span>
            <h2 id="activity-title">Actividad reciente</h2>
          </div>
          {workspace.activityError ? (
            <WorkspaceError label="Actividad no disponible" />
          ) : workspace.activity.length > 0 ? (
            <div className="workspace-activity-list">
              {workspace.activity.map((activity) => {
                const content = (
                  <>
                    <div><strong>{activity.label}</strong><p>{activity.description}</p></div>
                    <span>{formatWorkspaceDate(activity.createdAt)}</span>
                  </>
                );
                return activity.href ? (
                  <Link className="workspace-activity-item" href={activity.href} key={activity.id}>{content}</Link>
                ) : (
                  <article className="workspace-activity-item" key={activity.id}>{content}</article>
                );
              })}
            </div>
          ) : (
            <WorkspaceEmpty label="Sin actividad reciente" />
          )}
        </section>
      </section>

      <section className="workspace-section" aria-labelledby="quick-actions-title">
        <div className="workspace-section-heading">
          <span>Acciones</span>
          <h2 id="quick-actions-title">Accesos rapidos</h2>
        </div>
        <div className="workspace-quick-grid">
          {quickActions.map((action) => (
            <Link className="workspace-action-card" data-primary={action.primary} href={action.href} key={action.href}>
              <span>{action.label}</span><p>{action.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function MetricCard({ metric, variant, currency }: {
  metric: WorkspaceMetric;
  variant: 'pending' | 'summary';
  currency: string;
}) {
  const hasAttention = typeof metric.value === 'number' && metric.value > 0 && variant === 'pending';
  return (
    <Link className="workspace-metric-card" data-attention={hasAttention} data-unavailable={Boolean(metric.error)} href={metric.href}>
      <span className="workspace-metric-label">{metric.label}</span>
      <strong>{formatMetricValue(metric, currency)}</strong>
      <p>{metric.error ? 'Dato no disponible.' : metric.description}</p>
    </Link>
  );
}

function WorkspaceError({ label }: { label: string }) {
  return <div className="products-state products-state-error workspace-empty-state"><strong>{label}</strong></div>;
}

function WorkspaceEmpty({ label }: { label: string }) {
  return <div className="products-state workspace-empty-state"><strong>{label}</strong></div>;
}

function formatMetricValue(metric: WorkspaceMetric, currency: string) {
  if (metric.value === null) return '-';
  return metric.format === 'currency'
    ? formatMoney(metric.value, currency)
    : new Intl.NumberFormat('es-AR').format(metric.value);
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
