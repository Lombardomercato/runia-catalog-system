export default function ProductEditLoading() {
  return (
    <main className="product-edit-page">
      <header className="admin-header product-edit-header">
        <p className="admin-kicker">Producto</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Cargando</h1>
            <p className="admin-subtitle">Preparando datos editables.</p>
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
