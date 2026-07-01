import Link from 'next/link';

export default function CatalogProductNotFound() {
  return <main className="public-catalog"><section className="catalog-shell catalog-detail-error"><strong>Producto no encontrado.</strong><p>El producto no existe o ya no esta publicado.</p><Link href="/catalogo">Volver al catalogo</Link></section></main>;
}
