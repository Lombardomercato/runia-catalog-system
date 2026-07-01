'use client';

export default function CatalogError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="public-catalog">
      <section className="catalog-shell catalog-detail-error">
        <strong>No se pudo cargar el catalogo.</strong>
        <p>{error.message}</p>
        <button className="catalog-clear-button" onClick={reset} type="button">Reintentar</button>
      </section>
    </main>
  );
}
