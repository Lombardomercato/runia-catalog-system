'use client';

export default function AccountsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="accounts-page">
      <header className="admin-header accounts-header">
        <p className="admin-kicker">Commerce</p>
        <h1 className="admin-title">Accounts</h1>
      </header>

      <section className="products-state products-state-error">
        <strong>No se pudo cargar accounts.</strong>
        <p>{error.message}</p>
        <button className="products-action-button" onClick={reset} type="button">
          Reintentar
        </button>
      </section>
    </main>
  );
}
