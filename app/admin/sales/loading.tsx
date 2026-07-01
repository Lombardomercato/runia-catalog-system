export default function SalesLoading() {
  return (
    <main className="sales-page">
      <header className="admin-header sales-header">
        <p className="admin-kicker">Motor comercial</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Pedidos</h1>
            <p className="admin-subtitle">Cargando pedidos comerciales.</p>
          </div>
          <span className="admin-status">Sincronizando</span>
        </div>
      </header>

      <section className="products-toolbar products-skeleton-block" aria-label="Cargando filtros" />
      <section className="sales-list" aria-label="Cargando pedidos">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="sales-row sales-row-skeleton" key={index}>
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
