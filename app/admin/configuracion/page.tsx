import { getTenantSettings } from '@/modules/tenant/queries';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { TenantSettingsClient } from './_components/TenantSettingsClient';

export const dynamic = 'force-dynamic';

export default async function AdminConfiguracionPage() {
  const tenantSlug = await getCurrentTenantSlug();
  const result = await getTenantSettings(tenantSlug);

  if (result.error || !result.tenant) {
    return (
      <main className="tenant-settings-page">
        <header className="admin-header tenant-settings-header">
          <p className="admin-kicker">SaaS</p>
          <h1 className="admin-title">Configuracion</h1>
          <p className="admin-subtitle">Ajustes del cliente y funcionalidades del tenant.</p>
        </header>

        <section className="products-state products-state-error">
          <strong>No se pudo cargar la configuracion.</strong>
          <p>{result.error}</p>
        </section>
      </main>
    );
  }

  return <TenantSettingsClient tenant={result.tenant} tenantSlug={tenantSlug} />;
}
