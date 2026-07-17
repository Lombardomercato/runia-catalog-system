import Link from 'next/link';
import type { CommerceMoney, CommerceProduct } from '@/sdk/server/types';
import {
  AddProductButton,
  mapCommerceProductToPublicCommerceProduct,
} from '@/modules/public-commerce';

export function ProductCard({ product }: { product: CommerceProduct }) {
  return (
    <article className="catalog-product-card">
      <Link className="catalog-card-link" href={`/catalogo/${encodeURIComponent(product.sku)}`}>
        <div className="catalog-card-top"><span>{product.brand.name}</span><code>{product.sku}</code></div>
        <div className="catalog-card-body"><span className="catalog-category">{product.category.name}</span><h2>{product.name}</h2>{product.variant ? <p>{product.variant}</p> : null}{product.productLine ? <small>Linea {product.productLine}</small> : null}</div>
      </Link>
      <div className="catalog-card-footer">
        <div><span>Precio</span><strong>{formatPrice(product.price)}</strong></div>
        <div className="catalog-card-commands">
          <Link className="catalog-card-action" href={`/catalogo/${encodeURIComponent(product.sku)}`}>Ver detalle</Link>
          <AddProductButton product={mapCommerceProductToPublicCommerceProduct(product)} />
        </div>
      </div>
    </article>
  );
}

export function formatPrice(price: CommerceMoney | null) {
  if (price === null) return 'Consultar';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: /^[A-Z]{3}$/.test(price.currency) ? price.currency : 'ARS', maximumFractionDigits: 2 }).format(Number(price.amount));
}
