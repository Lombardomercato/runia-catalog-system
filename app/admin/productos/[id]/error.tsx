'use client';

export default function ProductEditError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="product-edit-page">
      <header className="admin-header product-edit-header">
        <p className="admin-kicker">Producto</p>
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
