export default function AccountsLoading() {
  return (
    <main className="accounts-page">
      <header className="admin-header accounts-header">
        <p className="admin-kicker">Commerce</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Accounts</h1>
            <p className="admin-subtitle">Cargando cuentas comerciales.</p>
          </div>
          <span className="admin-status">Sincronizando</span>
        </div>
      </header>

      <section className="products-toolbar products-skeleton-block" aria-label="Cargando filtros" />

      <section className="accounts-list" aria-label="Cargando accounts">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="account-row account-row-skeleton" key={index}>
            <div className="products-skeleton-lines">
              <span />
              <span />
            </div>
            <span className="products-skeleton-price" />
          </div>
        ))}
      </section>
    </main>
  );
}
