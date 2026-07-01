import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { formatPrice } from '@/components/ProductCard';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { getPublicCatalogProductBySku } from '@/modules/catalog/queries';
import { buildCatalogWhatsAppUrl, formatCatalogWhatsAppMessage } from '@/modules/catalog/whatsapp';
import {
  AddProductButton,
  mapCatalogProductToPublicCommerceProduct,
  mapCatalogTenantToPublicCommerceTenant,
  PublicCommerceTenantSync,
} from '@/modules/public-commerce';

export const dynamic = 'force-dynamic';

export default async function CatalogProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const tenantSlug = await getCurrentTenantSlug();
  const { sku } = await params;
  const result = await getPublicCatalogProductBySku(tenantSlug, sku);
  if (result.notFound) notFound();
  if (result.error || !result.tenant || !result.product) {
    return <main className="public-catalog"><section className="catalog-shell catalog-detail-error"><strong>No se pudo cargar el producto.</strong><p>{result.error}</p><Link href="/catalogo">Volver al catalogo</Link></section></main>;
  }
  const { tenant, product } = result;
  const message = formatCatalogWhatsAppMessage(tenant, product);
  const whatsappUrl = buildCatalogWhatsAppUrl(tenant.whatsapp, message);

  return (
    <main className="public-catalog" style={catalogTheme(tenant)}>
      <PublicCommerceTenantSync tenant={mapCatalogTenantToPublicCommerceTenant(tenant)} />
      <header className="catalog-detail-header"><div className="catalog-shell"><Link className="catalog-brand" href="/catalogo"><span className="catalog-brand-mark" style={tenant.logoUrl ? { backgroundImage: `url("${tenant.logoUrl}")` } : undefined}>{tenant.logoUrl ? null : tenant.commercialName.slice(0, 1).toUpperCase()}</span><span><strong>{tenant.commercialName}</strong><small>Catalogo de productos</small></span></Link><Link className="catalog-home-link" href="/catalogo">Volver al catalogo</Link></div></header>
      <section className="catalog-shell catalog-detail">
        <div className="catalog-detail-main"><p className="catalog-detail-kicker">{product.categoryName} · {product.brandName}</p><h1>{product.name}</h1>{product.variant ? <p className="catalog-detail-variant">{product.variant}</p> : null}<dl className="catalog-product-specs"><div><dt>SKU</dt><dd>{product.sku}</dd></div><div><dt>Marca</dt><dd>{product.brandName}</dd></div><div><dt>Categoria</dt><dd>{product.categoryName}</dd></div>{product.productLine ? <div><dt>Linea</dt><dd>{product.productLine}</dd></div> : null}</dl>{product.description ? <div className="catalog-description"><h2>Descripcion</h2><p>{product.description}</p></div> : null}</div>
        <aside className="catalog-inquiry-panel"><span>Precio {tenant.priceList?.name}</span><strong>{formatPrice(product.price, product.currency)}</strong><p>Consulta disponibilidad y condiciones directamente con {tenant.commercialName}.</p><AddProductButton className="catalog-order-button" product={mapCatalogProductToPublicCommerceProduct(product)} />{whatsappUrl ? <a className="catalog-whatsapp-button" href={whatsappUrl} rel="noreferrer" target="_blank">Consultar por WhatsApp</a> : <><button className="catalog-whatsapp-button" disabled type="button">Consultar por WhatsApp</button><small className="catalog-whatsapp-notice">WhatsApp no configurado</small></>}</aside>
      </section>
    </main>
  );
}

function catalogTheme(tenant: NonNullable<Awaited<ReturnType<typeof getPublicCatalogProductBySku>>['tenant']>) {
  return { '--catalog-primary': tenant.primaryColor, '--catalog-secondary': tenant.secondaryColor, '--catalog-primary-contrast': tenant.primaryContrast, '--catalog-secondary-contrast': tenant.secondaryContrast } as CSSProperties;
}
