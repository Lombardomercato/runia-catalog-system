'use client';

export default function SalesEditError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="sales-edit-page">
      <header className="admin-header sales-header">
        <p className="admin-kicker">Motor comercial</p>
        <h1 className="admin-title">Error</h1>
      </header>

      <section className="products-state products-state-error">
        <strong>No se pudo cargar la edicion.</strong>
        <p>{error.message}</p>
        <button className="products-action-button" onClick={reset} type="button">
          Reintentar
        </button>
      </section>
    </main>
  );
}
