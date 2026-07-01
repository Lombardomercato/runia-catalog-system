import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { getCurrentTenantSlug } from '@/lib/currentTenant';
import { getPublicCatalog } from '@/modules/catalog/queries';
import { parseCatalogSearchParams } from '@/modules/catalog/validators';
import {
  mapCatalogTenantToPublicCommerceTenant,
  PublicCommerceTenantSync,
} from '@/modules/public-commerce';
import { CatalogControls } from './_components/CatalogControls';

export const dynamic = 'force-dynamic';

type CatalogPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CatalogoPage({ searchParams }: CatalogPageProps) {
  const tenantSlug = await getCurrentTenantSlug();
  const params = parseCatalogSearchParams(searchParams ? await searchParams : {});
  const result = await getPublicCatalog(tenantSlug, params);
  const tenant = result.tenant;
  const tenantName = tenant?.commercialName ?? tenantSlug;

  return (
    <main className="public-catalog" style={tenant ? catalogTheme(tenant) : undefined}>
      {tenant ? <PublicCommerceTenantSync tenant={mapCatalogTenantToPublicCommerceTenant(tenant)} /> : null}
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
              <span>{result.totalProducts} productos disponibles</span>
            </div>
            {tenant?.priceList ? <div className="catalog-list-label"><span>Lista vigente</span><strong>{tenant.priceList.name}</strong></div> : null}
          </div>
        </div>
      </header>

      <section className="catalog-shell catalog-content">
        <CatalogControls
          brands={result.brands}
          categories={result.categories}
          filteredCount={result.products.length}
          params={params}
          totalCount={result.totalProducts}
        />

        {result.error ? <div className="catalog-state catalog-state-error"><strong>No se pudo cargar el catalogo.</strong><p>{result.error}</p></div> : null}
        {!result.error && result.products.length === 0 ? <div className="catalog-state"><strong>No encontramos productos con esos filtros.</strong><button form="catalog-reset-form" type="submit">Limpiar filtros</button></div> : null}
        {!result.error && result.products.length > 0 ? <div className="catalog-grid">{result.products.map((product) => <ProductCard key={product.id} product={product} />)}</div> : null}
      </section>

      <footer className="catalog-footer"><div className="catalog-shell"><strong>{tenantName}</strong><span>Catalogo actualizado por Runia Catalog System</span></div></footer>
    </main>
  );
}

function catalogTheme(tenant: NonNullable<Awaited<ReturnType<typeof getPublicCatalog>>['tenant']>) {
  return {
    '--catalog-primary': tenant.primaryColor,
    '--catalog-secondary': tenant.secondaryColor,
    '--catalog-primary-contrast': tenant.primaryContrast,
    '--catalog-secondary-contrast': tenant.secondaryContrast,
  } as CSSProperties;
}
