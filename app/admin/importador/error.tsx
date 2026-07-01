'use client';

export default function ImporterError({ error, reset }: { error: Error; reset: () => void }) {
  return <main className="imports-page"><header className="admin-header"><p className="admin-kicker">Operaciones de catalogo</p><h1 className="admin-title">Importador</h1></header><section className="products-state products-state-error"><strong>No se pudo cargar el importador.</strong><p>{error.message}</p><button className="products-action-button" onClick={reset} type="button">Reintentar</button></section></main>;
}
