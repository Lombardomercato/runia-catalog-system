export default function ProductsLoading() {
  return (
    <main className="products-page">
      <header className="admin-header products-header">
        <p className="admin-kicker">Catalogo</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Productos</h1>
            <p className="admin-subtitle">Cargando productos y filtros.</p>
          </div>
          <span className="admin-status">Sincronizando</span>
        </div>
      </header>

      <section className="products-toolbar products-skeleton-block" aria-label="Cargando filtros" />

      <section className="products-list" aria-label="Cargando productos">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="product-row product-row-skeleton" key={index}>
            <span className="products-skeleton-dot" />
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
