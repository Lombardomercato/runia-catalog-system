export default function TenantSettingsLoading() {
  return (
    <main className="tenant-settings-page">
      <header className="admin-header tenant-settings-header">
        <p className="admin-kicker">SaaS</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Configuracion</h1>
            <p className="admin-subtitle">Cargando ajustes del tenant.</p>
          </div>
          <span className="admin-status">Sincronizando</span>
        </div>
      </header>

      <section className="tenant-settings-grid">
        <div className="tenant-settings-panel product-edit-skeleton" />
        <div className="tenant-settings-panel product-edit-skeleton" />
      </section>
    </main>
  );
}
