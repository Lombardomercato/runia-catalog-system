import Link from 'next/link';
import type { CatalogProduct } from '@/modules/catalog/types';
import {
  AddProductButton,
  mapCatalogProductToPublicCommerceProduct,
} from '@/modules/public-commerce';

export function ProductCard({ product }: { product: CatalogProduct }) {
  return (
    <article className="catalog-product-card">
      <Link className="catalog-card-link" href={`/catalogo/${encodeURIComponent(product.sku)}`}>
        <div className="catalog-card-top"><span>{product.brandName}</span><code>{product.sku}</code></div>
        <div className="catalog-card-body"><span className="catalog-category">{product.categoryName}</span><h2>{product.name}</h2>{product.variant ? <p>{product.variant}</p> : null}{product.productLine ? <small>Linea {product.productLine}</small> : null}</div>
      </Link>
      <div className="catalog-card-footer">
        <div><span>Precio</span><strong>{formatPrice(product.price, product.currency)}</strong></div>
        <div className="catalog-card-commands">
          <Link className="catalog-card-action" href={`/catalogo/${encodeURIComponent(product.sku)}`}>Ver detalle</Link>
          <AddProductButton product={mapCatalogProductToPublicCommerceProduct(product)} />
        </div>
      </div>
    </article>
  );
}

export function formatPrice(price: number | null, currency: string) {
  if (price === null) return 'Consultar';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: /^[A-Z]{3}$/.test(currency) ? currency : 'ARS', maximumFractionDigits: 2 }).format(price);
}
