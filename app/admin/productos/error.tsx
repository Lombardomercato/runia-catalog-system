'use client';

export default function ProductsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="products-page">
      <header className="admin-header products-header">
        <p className="admin-kicker">Catalogo</p>
        <h1 className="admin-title">Productos</h1>
      </header>

      <section className="products-state products-state-error">
        <strong>No se pudo cargar productos.</strong>
        <p>{error.message}</p>
        <button className="products-action-button" onClick={reset} type="button">
          Reintentar
        </button>
      </section>
    </main>
  );
}
