export function ComingSoon({ title }: { title: string }) {
  return (
    <main>
      <header className="admin-header">
        <p className="admin-kicker">Backoffice</p>
        <h1 className="admin-title">{title}</h1>
      </header>

      <section className="admin-coming-soon">
        <p>Proximamente</p>
      </section>
    </main>
  );
}
