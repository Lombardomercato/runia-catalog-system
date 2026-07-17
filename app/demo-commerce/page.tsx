import Link from 'next/link';
import { createDemoCommerce } from './commerce';
import { formatDemoMoney } from './presentation';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;

type DemoCommerce = ReturnType<typeof createDemoCommerce>;
type DemoTenant = Awaited<ReturnType<DemoCommerce['tenant']['getPublicConfig']>>;
type DemoCatalog = Awaited<ReturnType<DemoCommerce['products']['list']>>;
type SearchParams = Record<string, string | string[] | undefined>;

export default async function DemoCommercePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const rawParams = searchParams ? await searchParams : {};
  const search = readParam(rawParams.q).slice(0, 100);
  const category = readParam(rawParams.category);
  const brand = readParam(rawParams.brand);
  const view = readParam(rawParams.view);
  const requestedPage = positivePage(readParam(rawParams.page));
  const featuredMode = !search && !category && !brand && requestedPage === 1 && view !== 'all';
  const commerce = createDemoCommerce();
  let tenant: DemoTenant | null = null;
  let catalog: DemoCatalog | null = null;
  let failed = false;

  try {
    if (featuredMode) {
      const [resolvedTenant, featured, categories, brands] = await Promise.all([
        commerce.tenant.getPublicConfig(),
        commerce.products.featured({ limit: PAGE_SIZE }),
        commerce.categories.list(),
        commerce.brands.list(),
      ]);
      tenant = resolvedTenant;
      catalog = {
        products: featured,
        categories,
        brands,
        pagination: {
          page: 1,
          pageSize: PAGE_SIZE,
          total: featured.length,
          totalPages: 1,
          hasPrevious: false,
          hasNext: false,
        },
        totalProducts: featured.length,
      };
    } else {
      [tenant, catalog] = await Promise.all([
        commerce.tenant.getPublicConfig(),
        commerce.products.list({
          search: search || undefined,
          category: category || undefined,
          brand: brand || undefined,
          sort: 'name_asc',
          page: requestedPage,
          pageSize: PAGE_SIZE,
        }),
      ]);
    }
  } catch {
    failed = true;
  }

  const tenantName = tenant?.name ?? 'Runia Commerce';
  const products = catalog?.products ?? [];
  const pagination = catalog?.pagination ?? null;
  const hasFilters = Boolean(search || category || brand);

  return (
    <main className="demo-commerce">
      <header className="demo-masthead">
        <div className="demo-frame demo-masthead-inner">
          <Link className="demo-wordmark" href="/demo-commerce" aria-label="Ir al inicio de Commerce Edit">
            <span aria-hidden="true">R/C</span>
            <strong>Commerce Edit</strong>
          </Link>
          <p>{tenantName} <span>/</span> Edición pública 02</p>
        </div>
      </header>

      <section className="demo-frame demo-hero">
        <div className="demo-hero-copy">
          <p className="demo-kicker">Segunda implementación · mismo motor</p>
          <h1>Un catálogo para mirar con pausa.</h1>
        </div>
        <div className="demo-hero-note">
          <p>
            Una lectura editorial de la selección de {tenantName}: información clara,
            ritmo amplio y acceso directo a cada producto.
          </p>
          <dl>
            <div><dt>Edición</dt><dd>02 / 2026</dd></div>
            <div><dt>Selección</dt><dd>{catalog?.totalProducts ?? '—'} referencias</dd></div>
          </dl>
        </div>
      </section>

      <section className="demo-frame demo-browser" aria-labelledby="demo-browser-title">
        <div className="demo-section-heading">
          <p>Índice de productos</p>
          <h2 id="demo-browser-title">Explorar la edición</h2>
        </div>

        <form className="demo-filters" action="/demo-commerce" method="get">
          <label className="demo-search-field">
            <span>Buscar</span>
            <input
              defaultValue={search}
              maxLength={100}
              name="q"
              placeholder="Nombre, SKU, línea…"
              type="search"
            />
          </label>
          <label>
            <span>Categoría</span>
            <select defaultValue={category} name="category">
              <option value="">Todas</option>
              {(catalog?.categories ?? []).map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Marca</span>
            <select defaultValue={brand} name="brand">
              <option value="">Todas</option>
              {(catalog?.brands ?? []).map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
          <div className="demo-filter-actions">
            <button type="submit">Aplicar</button>
            {hasFilters ? <Link href="/demo-commerce">Limpiar</Link> : null}
          </div>
        </form>

        {failed ? (
          <div className="demo-empty" role="alert">
            <span>Sin conexión editorial</span>
            <h3>No pudimos abrir esta edición.</h3>
            <p>Volvé a intentarlo en unos minutos.</p>
          </div>
        ) : null}

        {!failed && products.length === 0 ? (
          <div className="demo-empty">
            <span>0 resultados</span>
            <h3>No encontramos coincidencias.</h3>
            <p>Probá otra palabra o abrí nuevamente el índice completo.</p>
            <Link href="/demo-commerce">Ver toda la edición</Link>
          </div>
        ) : null}

        {!failed && products.length > 0 ? (
          <>
            <div className="demo-result-line">
              <span>{pagination?.total ?? products.length} {featuredMode ? 'destacados' : 'resultados'}</span>
              {featuredMode ? (
                <Link href="/demo-commerce?view=all">Ver el índice completo →</Link>
              ) : (
                <span>Página {pagination?.page ?? 1} de {pagination?.totalPages ?? 1}</span>
              )}
            </div>
            <ol className="demo-product-list" start={((pagination?.page ?? 1) - 1) * PAGE_SIZE + 1}>
              {products.map((product, index) => (
                <li key={product.id}>
                  <Link href={`/demo-commerce/${encodeURIComponent(product.sku)}`}>
                    <span className="demo-product-number">
                      {String(((pagination?.page ?? 1) - 1) * PAGE_SIZE + index + 1).padStart(2, '0')}
                    </span>
                    <div className="demo-product-title">
                      <p>{featuredMode ? 'Selección v1.1' : product.sku}</p>
                      <h3>{product.name}</h3>
                      {product.variant ? <span>{product.variant}</span> : null}
                    </div>
                    <dl className="demo-product-meta">
                      <div><dt>Marca</dt><dd>{product.brand.name}</dd></div>
                      <div><dt>Categoría</dt><dd>{product.category.name}</dd></div>
                    </dl>
                    <div className="demo-product-price">
                      <strong>{formatDemoMoney(product.price, tenant?.locale ?? 'es-AR')}</strong>
                      <span>Ver ficha <b aria-hidden="true">↗</b></span>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
            {pagination && pagination.totalPages > 1 ? (
              <nav className="demo-pagination" aria-label="Paginación del catálogo">
                {pagination.hasPrevious ? (
                  <Link href={pageHref(rawParams, pagination.page - 1)}>← Anterior</Link>
                ) : <span />}
                <p>{pagination.page.toString().padStart(2, '0')} / {pagination.totalPages.toString().padStart(2, '0')}</p>
                {pagination.hasNext ? (
                  <Link href={pageHref(rawParams, pagination.page + 1)}>Siguiente →</Link>
                ) : <span />}
              </nav>
            ) : null}
          </>
        ) : null}
      </section>

      <footer className="demo-footer">
        <div className="demo-frame">
          <strong>{tenantName}</strong>
          <p>Datos comerciales por Runia Commerce · Dirección visual independiente</p>
        </div>
      </footer>
    </main>
  );
}

function readParam(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function positivePage(value: string) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function pageHref(params: SearchParams, page: number) {
  const query = new URLSearchParams();
  for (const key of ['q', 'category', 'brand', 'view'] as const) {
    const value = readParam(params[key]);
    if (value) query.set(key, value);
  }
  query.set('page', String(page));
  return `/demo-commerce?${query.toString()}`;
}
