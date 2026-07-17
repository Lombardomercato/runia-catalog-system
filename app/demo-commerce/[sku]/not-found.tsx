import Link from 'next/link';

export default function DemoCommerceProductNotFound() {
  return (
    <main className="demo-commerce demo-detail-page">
      <header className="demo-masthead">
        <div className="demo-frame demo-masthead-inner">
          <Link className="demo-wordmark" href="/demo-commerce">
            <span>R/C</span>
            <strong>Commerce Edit</strong>
          </Link>
          <p>Ficha no encontrada</p>
        </div>
      </header>
      <section className="demo-frame demo-detail-error">
        <p className="demo-kicker">Fuera de archivo</p>
        <h1>Este producto no está disponible.</h1>
        <Link href="/demo-commerce">← Volver al índice</Link>
      </section>
    </main>
  );
}
