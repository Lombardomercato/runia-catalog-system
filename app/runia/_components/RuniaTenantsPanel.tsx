import Link from 'next/link';
import type { TenantListItem, TenantListResult } from '@/modules/tenants/types';

type RuniaTenantsPanelProps = {
  result: TenantListResult;
};

export function RuniaTenantsPanel({ result }: RuniaTenantsPanelProps) {
  return (
    <main className="runia-page">
      <header className="runia-hero">
        <div>
          <p className="runia-kicker">Runia SaaS</p>
          <h1>Tenants</h1>
          <p>Panel central para crear, revisar y entrar a los workspaces de clientes.</p>
        </div>
        <Link className="runia-primary-link" href="/runia/tenants/new">
          Nuevo Tenant
        </Link>
      </header>

      {result.error ? (
        <section className="runia-alert">
          <strong>Algunas metricas no estan disponibles.</strong>
          <p>{result.error}</p>
        </section>
      ) : null}

      {result.tenants.length === 0 ? (
        <section className="runia-empty">
          <strong>No hay tenants cargados.</strong>
          <p>Crea el primer cliente desde Nuevo Tenant para dejarlo listo para importar catalogo.</p>
        </section>
      ) : (
        <section className="runia-tenant-list" aria-label="Listado de tenants">
          <div className="runia-tenant-head">
            <span>Empresa</span>
            <span>Estado</span>
            <span>Creacion</span>
            <span>Productos</span>
            <span>Accounts</span>
            <span>Pedidos</span>
            <span>Accion</span>
          </div>
          {result.tenants.map((tenant) => (
            <TenantRow key={tenant.id} tenant={tenant} />
          ))}
        </section>
      )}
    </main>
  );
}

function TenantRow({ tenant }: { tenant: TenantListItem }) {
  return (
    <article className="runia-tenant-row">
      <div className="runia-tenant-main">
        <span
          className="runia-tenant-logo"
          style={{
            background: tenant.logoUrl
              ? undefined
              : `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.secondaryColor})`,
          }}
        >
          {tenant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={tenant.logoUrl} />
          ) : (
            tenant.name.slice(0, 1).toUpperCase()
          )}
        </span>
        <div>
          <h2>{tenant.name}</h2>
          <p>{tenant.slug}</p>
        </div>
      </div>

      <span className="runia-status" data-status={tenant.status}>
        {tenant.status}
      </span>
      <span className="runia-muted">{formatDate(tenant.createdAt)}</span>
      <strong>{formatCount(tenant.productsCount)}</strong>
      <strong>{formatCount(tenant.accountsCount)}</strong>
      <strong>{formatCount(tenant.salesCount)}</strong>
      <Link className="runia-secondary-link" href={`/runia/tenants/${tenant.slug}/enter`}>
        Entrar al Tenant
      </Link>
    </article>
  );
}

function formatCount(value: number | null) {
  if (value === null) {
    return '-';
  }

  return new Intl.NumberFormat('es-AR').format(value);
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Sin datos';
  }

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
