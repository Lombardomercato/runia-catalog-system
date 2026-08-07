import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { formatPrice } from '@/components/ProductCard';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import {
  AddProductButton,
  mapCommerceProductToPublicCommerceProduct,
  PublicCommerceTenantSync,
} from '@/modules/public-commerce';
import { resolvePublicCommerceTenant } from '@/modules/public-commerce/server/resolveCommerceTenant';
import {
  CommerceSdkError,
  createCommerceClient,
  type CommerceProductDetail,
  type CommerceTenantPublicConfig,
} from '@/sdk/server';
import { buildCatalogWhatsAppUrl, formatCatalogWhatsAppMessage } from '../catalogWhatsApp';

export const dynamic = 'force-dynamic';

export default async function CatalogProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const tenantSlug = await getCurrentTenantSlug('public');
  const { sku } = await params;
  const commerce = createCommerceClient({ tenantSlug });
  let tenant: CommerceTenantPublicConfig;
  let product: CommerceProductDetail;
  let draftTenant;
  try {
    [tenant, product, draftTenant] = await Promise.all([
      commerce.tenant.getPublicConfig(),
      commerce.products.getBySku(sku),
      resolvePublicCommerceTenant(commerce),
    ]);
  } catch (error) {
    if (error instanceof CommerceSdkError && error.code === 'PRODUCT_NOT_FOUND') notFound();
    return <main className="public-catalog"><section className="catalog-shell catalog-detail-error"><strong>No se pudo cargar el producto.</strong><p>{publicProductError(error)}</p><Link href="/catalogo">Volver al catalogo</Link></section></main>;
  }
  const message = formatCatalogWhatsAppMessage(tenant, product);
  const whatsappUrl = buildCatalogWhatsAppUrl(tenant.whatsapp, message);

  return (
    <main className="public-catalog" style={catalogTheme(tenant)}>
      <PublicCommerceTenantSync tenant={draftTenant} />
      <header className="catalog-detail-header"><div className="catalog-shell"><Link className="catalog-brand" href="/catalogo"><span className="catalog-brand-mark" style={tenant.logoUrl ? { backgroundImage: `url("${tenant.logoUrl}")` } : undefined}>{tenant.logoUrl ? null : tenant.name.slice(0, 1).toUpperCase()}</span><span><strong>{tenant.name}</strong><small>Catalogo de productos</small></span></Link><Link className="catalog-home-link" href="/catalogo">Volver al catalogo</Link></div></header>
      <section className="catalog-shell catalog-detail">
        <div className="catalog-detail-main"><p className="catalog-detail-kicker">{product.category.name} · {product.brand.name}</p><h1>{product.name}</h1>{product.variant ? <p className="catalog-detail-variant">{product.variant}</p> : null}<dl className="catalog-product-specs"><div><dt>SKU</dt><dd>{product.sku}</dd></div><div><dt>Marca</dt><dd>{product.brand.name}</dd></div><div><dt>Categoria</dt><dd>{product.category.name}</dd></div>{product.productLine ? <div><dt>Linea</dt><dd>{product.productLine}</dd></div> : null}</dl>{product.description ? <div className="catalog-description"><h2>Descripcion</h2><p>{product.description}</p></div> : null}</div>
        <aside className="catalog-inquiry-panel"><span>Precio vigente</span><strong>{formatPrice(product.price)}</strong><p>Consulta disponibilidad y condiciones directamente con {tenant.name}.</p><AddProductButton className="catalog-order-button" product={mapCommerceProductToPublicCommerceProduct(product)} />{whatsappUrl ? <a className="catalog-whatsapp-button" href={whatsappUrl} rel="noreferrer" target="_blank">Consultar por WhatsApp</a> : <><button className="catalog-whatsapp-button" disabled type="button">Consultar por WhatsApp</button><small className="catalog-whatsapp-notice">WhatsApp no configurado</small></>}</aside>
      </section>
    </main>
  );
}

function catalogTheme(tenant: CommerceTenantPublicConfig) {
  return {
    '--catalog-primary': tenant.primaryColor,
    '--catalog-secondary': tenant.secondaryColor,
    '--catalog-primary-contrast': contrastColor(tenant.primaryColor),
    '--catalog-secondary-contrast': contrastColor(tenant.secondaryColor),
  } as CSSProperties;
}

function contrastColor(hex: string) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '0f172a';
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? '#111827' : '#ffffff';
}

function publicProductError(error: unknown) {
  if (!(error instanceof CommerceSdkError)) return 'No se pudo cargar el producto.';
  if (error.code === 'TENANT_NOT_FOUND') return 'No se encontro el cliente solicitado.';
  if (error.code === 'TENANT_INACTIVE') return 'El cliente no esta activo.';
  if (error.code === 'PUBLIC_PRICE_LIST_NOT_FOUND') return 'No hay una lista de precios publica activa.';
  return 'No se pudo cargar el producto.';
}
