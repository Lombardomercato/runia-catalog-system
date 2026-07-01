export default function CatalogLoading() {
  return <main className="public-catalog"><header className="catalog-header"><div className="catalog-shell"><div className="catalog-heading"><div><p>Catalogo publico</p><h1>Cargando catalogo</h1></div></div></div></header><section className="catalog-shell catalog-content"><div className="catalog-controls catalog-loading-block" /><div className="catalog-grid">{Array.from({ length: 8 }).map((_, index) => <div className="catalog-product-card catalog-card-skeleton" key={index} />)}</div></section></main>;
}
