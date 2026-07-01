export default function ImporterLoading() {
  return <main className="imports-page"><header className="admin-header"><p className="admin-kicker">Operaciones de catalogo</p><h1 className="admin-title">Importador</h1></header><section className="products-toolbar products-skeleton-block" /><section className="imports-stats-grid">{Array.from({ length: 4 }).map((_, index) => <div className="imports-stat-card pricing-row-skeleton" key={index} />)}</section></main>;
}
