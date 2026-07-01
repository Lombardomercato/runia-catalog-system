'use client';

export default function SalesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="sales-page">
      <header className="admin-header sales-header">
        <p className="admin-kicker">Motor comercial</p>
        <h1 className="admin-title">Pedidos</h1>
      </header>

      <section className="products-state products-state-error">
        <strong>No se pudieron cargar los pedidos.</strong>
        <p>{error.message}</p>
        <button className="products-action-button" onClick={reset} type="button">
          Reintentar
        </button>
      </section>
    </main>
  );
}
