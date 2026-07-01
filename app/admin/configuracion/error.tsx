'use client';

export default function TenantSettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="tenant-settings-page">
      <header className="admin-header tenant-settings-header">
        <p className="admin-kicker">SaaS</p>
        <h1 className="admin-title">Configuracion</h1>
      </header>

      <section className="products-state products-state-error">
        <strong>No se pudo cargar la configuracion.</strong>
        <p>{error.message}</p>
        <button className="products-action-button" onClick={reset} type="button">
          Reintentar
        </button>
      </section>
    </main>
  );
}
