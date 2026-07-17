import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createDemoCommerce } from '../commerce';
import { formatDemoMoney } from '../presentation';

export const dynamic = 'force-dynamic';

type DemoCommerce = ReturnType<typeof createDemoCommerce>;
type DemoTenant = Awaited<ReturnType<DemoCommerce['tenant']['getPublicConfig']>>;
type DemoProduct = Awaited<ReturnType<DemoCommerce['products']['getBySku']>>;

export default async function DemoCommerceProductPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  const commerce = createDemoCommerce();
  let tenant: DemoTenant | null = null;
  let product: DemoProduct | null = null;

  try {
    [tenant, product] = await Promise.all([
      commerce.tenant.getPublicConfig(),
      commerce.products.getBySku(sku),
    ]);
  } catch (error) {
    if (commerce.errors.isNotFound(error)) notFound();
    return (
      <main className="demo-commerce demo-detail-page">
        <header className="demo-masthead">
          <div className="demo-frame demo-masthead-inner">
            <Link className="demo-wordmark" href="/demo-commerce"><span>R/C</span><strong>Commerce Edit</strong></Link>
            <p>Ficha no disponible</p>
          </div>
        </header>
        <section className="demo-frame demo-detail-error">
          <p className="demo-kicker">Archivo incompleto</p>
          <h1>No pudimos abrir este producto.</h1>
          <Link href="/demo-commerce">← Volver al índice</Link>
        </section>
      </main>
    );
  }

  const variant = product.variant ? `, variante ${product.variant}` : '';
  const whatsapp = await commerce.tenant.buildWhatsAppUrl({
    message: `Hola, quisiera consultar por ${product.name}${variant} (SKU ${product.sku}).`,
  });

  return (
    <main className="demo-commerce demo-detail-page">
      <header className="demo-masthead">
        <div className="demo-frame demo-masthead-inner">
          <Link className="demo-wordmark" href="/demo-commerce" aria-label="Volver a Commerce Edit">
            <span aria-hidden="true">R/C</span>
            <strong>Commerce Edit</strong>
          </Link>
          <p>{tenant.name} <span>/</span> Ficha {product.sku}</p>
        </div>
      </header>

      <article className="demo-frame demo-detail">
        <nav className="demo-breadcrumb" aria-label="Migas de pan">
          <Link href="/demo-commerce">Índice</Link>
          <span>/</span>
          <span>{product.category.name}</span>
          <span>/</span>
          <strong>{product.sku}</strong>
        </nav>

        <div className="demo-detail-grid">
          <div className="demo-detail-folio" aria-hidden="true">
            <span>Ficha</span>
            <strong>{product.sku}</strong>
          </div>
          <div className="demo-detail-copy">
            <p className="demo-kicker">{product.brand.name} · {product.category.name}</p>
            <h1>{product.name}</h1>
            {product.variant ? <p className="demo-detail-variant">{product.variant}</p> : null}

            <dl className="demo-specs">
              <div><dt>Marca</dt><dd>{product.brand.name}</dd></div>
              <div><dt>Categoría</dt><dd>{product.category.name}</dd></div>
              <div><dt>Línea</dt><dd>{product.productLine ?? 'Sin especificar'}</dd></div>
              <div><dt>Referencia</dt><dd>{product.sku}</dd></div>
            </dl>

            {product.description ? (
              <section className="demo-description">
                <h2>Notas del producto</h2>
                <p>{product.description}</p>
              </section>
            ) : null}
          </div>

          <aside className="demo-detail-aside">
            <p>Precio público vigente</p>
            <strong>{formatDemoMoney(product.price, tenant.locale)}</strong>
            <span>Información provista por {tenant.name}. Consultá disponibilidad y condiciones.</span>
            {whatsapp.available ? (
              <a href={whatsapp.url} rel="noreferrer" target="_blank">Consultar por WhatsApp ↗</a>
            ) : (
              <span className="demo-disabled-cta" aria-disabled="true">WhatsApp no disponible</span>
            )}
          </aside>
        </div>
      </article>

      <footer className="demo-footer">
        <div className="demo-frame">
          <Link href="/demo-commerce">← Volver a la edición</Link>
          <p>Commerce Edit · Runia Web × Runia Commerce</p>
        </div>
      </footer>
    </main>
  );
}
