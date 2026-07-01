export default function SalesEditLoading() {
  return (
    <main className="sales-edit-page">
      <header className="admin-header sales-header">
        <p className="admin-kicker">Motor comercial</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Cargando</h1>
            <p className="admin-subtitle">Preparando pedido comercial.</p>
          </div>
          <span className="admin-status">Sincronizando</span>
        </div>
      </header>

      <section className="product-edit-grid">
        <div className="product-edit-panel product-edit-skeleton" />
        <div className="product-edit-panel product-edit-skeleton" />
      </section>
    </main>
  );
}
