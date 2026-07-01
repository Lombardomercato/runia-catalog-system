import Link from 'next/link';
import { formatWorkspaceDate } from '@/modules/workspace/mapper';
import type { CommercialWorkspace as CommercialWorkspaceData, WorkspaceMetric } from '@/modules/workspace/types';

type CommercialWorkspaceProps = {
  workspace: CommercialWorkspaceData;
};

const quickActions = [
  {
    label: 'Nuevo Pedido',
    href: '/admin/sales/new',
    description: 'Crear una orden comercial desde una account.',
    primary: true,
  },
  {
    label: 'Nueva Account',
    href: '/admin/accounts/new',
    description: 'Cargar una cuenta comercial para pedidos futuros.',
    primary: false,
  },
  {
    label: 'Nuevo Producto',
    href: '/admin/productos',
    description: 'Ir al modulo de productos. Alta directa queda preparada para el siguiente paso.',
    primary: false,
  },
  {
    label: 'Importar Catalogo',
    href: '/admin/importador',
    description: 'Abrir el espacio reservado para cargas masivas.',
    primary: false,
  },
  {
    label: 'Ver Pedidos',
    href: '/admin/sales',
    description: 'Revisar el pipeline comercial actual.',
    primary: false,
  },
] as const;

export function CommercialWorkspace({ workspace }: CommercialWorkspaceProps) {
  return (
    <main className="workspace-page">
      <header className="admin-header workspace-header">
        <p className="admin-kicker">{workspace.tenant?.slug ?? 'tenant no disponible'}</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Commercial Workspace</h1>
            <p className="admin-subtitle">
              Centro operativo para ver pendientes, iniciar acciones y revisar actividad reciente.
            </p>
          </div>
          <span className="admin-status">Operacion diaria</span>
        </div>
      </header>

      {workspace.errors.length > 0 ? (
        <section className="admin-error workspace-alert">
          <strong>Hay datos no disponibles en este entorno.</strong>
          <p>
            El workspace sigue operativo y marca los bloques afectados hasta que las tablas o
            permisos queden disponibles.
          </p>
        </section>
      ) : null}

      <section className="workspace-section" aria-labelledby="quick-actions-title">
        <div className="workspace-section-heading">
          <span>Seccion 1</span>
          <h2 id="quick-actions-title">Quick Actions</h2>
        </div>

        <div className="workspace-quick-grid">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              className="workspace-action-card"
              data-primary={action.primary}
              href={action.href}
            >
              <span>{action.label}</span>
              <p>{action.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="workspace-section" aria-labelledby="pending-title">
        <div className="workspace-section-heading">
          <span>Seccion 2</span>
          <h2 id="pending-title">Trabajo Pendiente</h2>
        </div>

        <div className="workspace-pending-grid">
          {workspace.pending.map((metric) => (
            <MetricCard key={metric.key} metric={metric} variant="pending" />
          ))}
        </div>
      </section>

      <section className="workspace-two-column">
        <section className="workspace-section" aria-labelledby="activity-title">
          <div className="workspace-section-heading">
            <span>Seccion 3</span>
            <h2 id="activity-title">Actividad reciente</h2>
          </div>

          {workspace.activityError ? (
            <div className="products-state products-state-error workspace-empty-state">
              <strong>Actividad no disponible</strong>
              <p>La seccion queda preparada para `audit_logs`, pero la consulta no respondio en este entorno.</p>
            </div>
          ) : workspace.activity.length > 0 ? (
            <div className="workspace-activity-list">
              {workspace.activity.map((activity) => {
                const content = (
                  <>
                    <div>
                      <strong>{activity.label}</strong>
                      <p>{activity.description}</p>
                    </div>
                    <span>{formatWorkspaceDate(activity.createdAt)}</span>
                  </>
                );

                return activity.href ? (
                  <Link key={activity.id} className="workspace-activity-item" href={activity.href}>
                    {content}
                  </Link>
                ) : (
                  <article key={activity.id} className="workspace-activity-item">
                    {content}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="products-state workspace-empty-state">
              <strong>Sin actividad reciente</strong>
              <p>Cuando Productos, Pedidos, importaciones u otros comandos escriban auditoria, van a aparecer aca.</p>
            </div>
          )}
        </section>

        <section className="workspace-section" aria-labelledby="summary-title">
          <div className="workspace-section-heading">
            <span>Seccion 4</span>
            <h2 id="summary-title">Resumen</h2>
          </div>

          <div className="workspace-summary-grid">
            {workspace.summary.map((metric) => (
              <MetricCard key={metric.key} metric={metric} variant="summary" />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function MetricCard({
  metric,
  variant,
}: {
  metric: WorkspaceMetric;
  variant: 'pending' | 'summary';
}) {
  const hasAttention = typeof metric.value === 'number' && metric.value > 0 && variant === 'pending';

  return (
    <Link
      className="workspace-metric-card"
      data-attention={hasAttention}
      data-unavailable={Boolean(metric.error)}
      href={metric.href}
    >
      <span className="workspace-metric-label">{metric.label}</span>
      <strong>{formatMetricValue(metric.value)}</strong>
      <p>{metric.error ? 'Dato no disponible en este entorno.' : metric.description}</p>
    </Link>
  );
}

function formatMetricValue(value: number | null) {
  if (value === null) {
    return '-';
  }

  return new Intl.NumberFormat('es-AR').format(value);
}
