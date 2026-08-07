import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { PublicCommerceTenantSync } from '@/modules/public-commerce';
import { resolvePublicCommerceTenant } from '@/modules/public-commerce/server/resolveCommerceTenant';
import {
  CommerceSdkError,
  createCommerceClient,
  type CommerceProductsList,
  type CommerceTenantPublicConfig,
} from '@/sdk/server';
import { CatalogControls } from './_components/CatalogControls';
import { parseCatalogSearchParams } from './catalogSearchParams';

export const dynamic = 'force-dynamic';

type CatalogPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CatalogoPage({ searchParams }: CatalogPageProps) {
  const tenantSlug = await getCurrentTenantSlug('public');
  const params = parseCatalogSearchParams(searchParams ? await searchParams : {});
  const commerce = createCommerceClient({ tenantSlug });
  let tenant: CommerceTenantPublicConfig | null = null;
  let catalog: CommerceProductsList | null = null;
  let draftTenant = null;
  let error: string | null = null;
  try {
    [tenant, catalog, draftTenant] = await Promise.all([
      commerce.tenant.getPublicConfig(),
      commerce.products.list({
        search: params.search,
        category: params.categoryId === 'all' ? undefined : params.categoryId,
        brand: params.brandId === 'all' ? undefined : params.brandId,
        sort: params.sort,
        page: 1,
        pageSize: 100,
      }),
      resolvePublicCommerceTenant(commerce),
    ]);
  } catch (cause) {
    error = publicCatalogError(cause);
  }

  const products = catalog?.products ?? [];
  const categories = catalog?.categories ?? [];
  const brands = catalog?.brands ?? [];
  const totalProducts = catalog?.totalProducts ?? 0;
  const tenantName = tenant?.name ?? tenantSlug;

  return (
    <main className="public-catalog" style={tenant ? catalogTheme(tenant) : undefined}>
      {draftTenant ? <PublicCommerceTenantSync tenant={draftTenant} /> : null}
      <header className="catalog-header">
        <div className="catalog-shell">
          <nav className="catalog-topbar" aria-label="Navegacion publica">
            <Link className="catalog-brand" href="/catalogo">
              <span
                className="catalog-brand-mark"
                style={tenant?.logoUrl ? { backgroundImage: `url("${tenant.logoUrl}")` } : undefined}
              >
                {tenant?.logoUrl ? null : tenantName.slice(0, 1).toUpperCase()}
              </span>
              <span><strong>{tenantName}</strong><small>Catalogo de productos</small></span>
            </Link>
            <Link className="catalog-home-link" href="/">Inicio</Link>
          </nav>
          <div className="catalog-heading">
            <div>
              <p>Catalogo publico</p>
              <h1>{tenantName}</h1>
              <span>{totalProducts} productos disponibles</span>
            </div>
            {tenant ? <div className="catalog-list-label"><span>Lista vigente</span><strong>Precio publico</strong></div> : null}
          </div>
        </div>
      </header>

      <section className="catalog-shell catalog-content">
        <CatalogControls
          brands={brands}
          categories={categories}
          filteredCount={products.length}
          params={params}
          totalCount={totalProducts}
        />

        {error ? <div className="catalog-state catalog-state-error"><strong>No se pudo cargar el catalogo.</strong><p>{error}</p></div> : null}
        {!error && products.length === 0 ? <div className="catalog-state"><strong>No encontramos productos con esos filtros.</strong><button form="catalog-reset-form" type="submit">Limpiar filtros</button></div> : null}
        {!error && products.length > 0 ? <div className="catalog-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div> : null}
      </section>

      <footer className="catalog-footer"><div className="catalog-shell"><strong>{tenantName}</strong><span>Catalogo actualizado por Runia Catalog System</span></div></footer>
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

function publicCatalogError(error: unknown) {
  if (!(error instanceof CommerceSdkError)) return 'No se pudo cargar el catalogo.';
  if (error.code === 'TENANT_NOT_FOUND') return 'No se encontro el cliente solicitado.';
  if (error.code === 'TENANT_INACTIVE') return 'El cliente no esta activo.';
  if (error.code === 'PUBLIC_CATALOG_DISABLED') return 'El catalogo publico no esta disponible.';
  if (error.code === 'PUBLIC_PRICE_LIST_NOT_FOUND') return 'No hay una lista de precios publica activa.';
  return 'No se pudo cargar el catalogo.';
}
