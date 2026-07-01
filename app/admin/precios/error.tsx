'use client';

export default function PricingError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="pricing-page">
      <header className="admin-header pricing-header">
        <p className="admin-kicker">Motor comercial</p>
        <h1 className="admin-title">Precios</h1>
      </header>
      <section className="products-state products-state-error">
        <strong>No se pudo cargar la gestion de precios.</strong>
        <p>{error.message}</p>
        <button className="products-action-button" onClick={reset} type="button">
          Reintentar
        </button>
      </section>
    </main>
  );
}
