export default function PricingLoading() {
  return (
    <main className="pricing-page">
      <header className="admin-header pricing-header">
        <p className="admin-kicker">Motor comercial</p>
        <h1 className="admin-title">Precios</h1>
      </header>
      <section className="products-toolbar products-skeleton-block" />
      <section className="pricing-list">
        {Array.from({ length: 8 }).map((_, index) => (
          <div className="pricing-row pricing-row-skeleton" key={index} />
        ))}
      </section>
    </main>
  );
}
