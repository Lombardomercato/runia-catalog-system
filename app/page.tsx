import Link from 'next/link';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { getTenantIdentity } from '@/modules/tenant/queries';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const tenantSlug = await getCurrentTenantSlug();
  const tenantResult = await getTenantIdentity(tenantSlug);
  const tenantName = tenantResult.tenant?.name ?? tenantSlug;

  return (
    <main className="home">
      <section className="home-panel">
        <p className="eyebrow">Tenant activo: {tenantName}</p>
        <h1>Runia Catalog System</h1>
        <p className="lead">
          Catalogo digital mayorista/minorista preparado como base reutilizable para
          clientes de Runia.
        </p>
        <Link className="button" href="/catalogo">
          Ver catalogo
        </Link>
      </section>
    </main>
  );
}
