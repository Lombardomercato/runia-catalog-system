'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  ProductFiltersResult,
  ProductListParams,
  ProductListResult,
  ProductSortField,
  ProductStatusFilter,
  SortDirection,
} from '@/modules/products/types';
import { PRODUCT_PAGE_SIZE_OPTIONS } from '@/modules/products/validators';

type ProductsClientProps = {
  result: ProductListResult;
  filters: ProductFiltersResult;
  params: ProductListParams;
};

const statusOptions: Array<{ value: ProductStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
];

const sortOptions: Array<{ value: ProductSortField; label: string }> = [
  { value: 'sku', label: 'SKU' },
  { value: 'name', label: 'Nombre' },
  { value: 'price', label: 'Precio' },
];

const directionOptions: Array<{ value: SortDirection; label: string }> = [
  { value: 'asc', label: 'Asc' },
  { value: 'desc', label: 'Desc' },
];

export function ProductsClient({ result, filters, params }: ProductsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(params.search);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isPending, startTransition] = useTransition();
  const products = result.products;
  const visibleProductIds = useMemo(() => products.map((product) => product.id), [products]);
  const allVisibleSelected =
    visibleProductIds.length > 0 && visibleProductIds.every((id) => selectedIds.has(id));
  const hasSelected = selectedIds.size > 0;
  const error = result.error ?? filters.error;

  const updateParams = useCallback(
    (changes: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(searchParams.toString());

      Object.entries(changes).forEach(([key, value]) => {
        if (!value || value === 'all') {
          next.delete(key);
          return;
        }

        next.set(key, value);
      });

      if (resetPage) {
        next.delete('page');
      }

      const queryString = next.toString();

      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setQuery(params.search);
  }, [params.search]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [visibleProductIds]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query === params.search) {
        return;
      }

      updateParams({ q: query.trim() || null });
    }, 260);

    return () => window.clearTimeout(timer);
  }, [params.search, query, updateParams]);

  function toggleProduct(productId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }

      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        visibleProductIds.forEach((id) => next.delete(id));
      } else {
        visibleProductIds.forEach((id) => next.add(id));
      }

      return next;
    });
  }

  return (
    <main className="products-page">
      <header className="admin-header products-header">
        <p className="admin-kicker">Catalogo</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Productos</h1>
            <p className="admin-subtitle">
              Gestion operativa del catalogo, precios y estado de publicacion.
            </p>
          </div>
          <span className="admin-status">{result.pagination.total} registros</span>
        </div>
      </header>

      <section className="products-toolbar" aria-label="Filtros de productos">
        <label className="products-search">
          <span>Buscar</span>
          <input
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="SKU, nombre, variante o linea"
            type="search"
            value={query}
          />
        </label>

        <div className="products-filter-grid">
          <label className="products-control">
            <span>Categoria</span>
            <select
              onChange={(event) => updateParams({ category: event.target.value })}
              value={params.categoryId}
            >
              <option value="all">Todas</option>
              {filters.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="products-control">
            <span>Marca</span>
            <select
              onChange={(event) => updateParams({ brand: event.target.value })}
              value={params.brandId}
            >
              <option value="all">Todas</option>
              {filters.brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>

          <label className="products-control">
            <span>Estado</span>
            <select
              onChange={(event) => updateParams({ status: event.target.value })}
              value={params.status}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="products-control">
            <span>Orden</span>
            <select
              onChange={(event) => updateParams({ sort: event.target.value })}
              value={params.sort}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="products-control">
            <span>Direccion</span>
            <select
              onChange={(event) => updateParams({ dir: event.target.value })}
              value={params.direction}
            >
              {directionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="products-control">
            <span>Pagina</span>
            <select
              onChange={(event) => updateParams({ pageSize: event.target.value })}
              value={String(params.pageSize)}
            >
              {PRODUCT_PAGE_SIZE_OPTIONS.map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize} filas
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="products-bulk-bar" data-active={hasSelected}>
        <label className="products-check-label">
          <input
            aria-label="Seleccionar productos visibles"
            checked={allVisibleSelected}
            disabled={products.length === 0}
            onChange={toggleAllVisible}
            type="checkbox"
          />
          <span>{hasSelected ? `${selectedIds.size} seleccionados` : 'Seleccion multiple'}</span>
        </label>
        <button className="products-muted-button" disabled type="button">
          Acciones masivas
        </button>
      </section>

      {isPending ? <div className="products-loading-pill">Actualizando vista</div> : null}

      {error ? (
        <section className="products-state products-state-error">
          <strong>No se pudo cargar productos.</strong>
          <p>{error}</p>
        </section>
      ) : null}

      {!error && products.length === 0 ? (
        <section className="products-state">
          <strong>No hay productos para estos filtros.</strong>
          <p>Ajusta la busqueda, categoria, marca o estado para ampliar los resultados.</p>
        </section>
      ) : null}

      {!error && products.length > 0 ? (
        <section className="products-list" aria-label="Listado de productos">
          <div className="products-list-head" aria-hidden="true">
            <span>Producto</span>
            <span>Categoria / marca</span>
            <span>Precio minorista</span>
            <span>Estado</span>
          </div>

          {products.map((product) => (
            <article className="product-row" key={product.id}>
              <label className="product-row-check">
                <input
                  aria-label={`Seleccionar ${product.sku}`}
                  checked={selectedIds.has(product.id)}
                  onChange={() => toggleProduct(product.id)}
                  type="checkbox"
                />
              </label>

              <div className="product-row-main">
                <div className="product-row-kicker">
                  <span>{product.sku}</span>
                  {product.productLine ? <span>{product.productLine}</span> : null}
                </div>
                <h2>
                  <Link className="product-row-title-link" href={`/admin/productos/${product.id}`}>
                    {product.name}
                  </Link>
                </h2>
                {product.variant ? <p>{product.variant}</p> : null}
              </div>

              <div className="product-row-taxonomy">
                <span>{product.categoryName}</span>
                <strong>{product.brandName}</strong>
              </div>

              <div className="product-row-price">
                {formatPrice(product.price, product.currency)}
              </div>

              <div className="product-row-status" data-active={product.isActive}>
                {product.isActive ? 'Activo' : 'Inactivo'}
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <footer className="products-pagination">
        <span>
          Pagina {result.pagination.page} de {result.pagination.totalPages}
        </span>
        <div>
          <button
            disabled={!result.pagination.hasPrevious || isPending}
            onClick={() => updateParams({ page: String(result.pagination.page - 1) }, false)}
            type="button"
          >
            Anterior
          </button>
          <button
            disabled={!result.pagination.hasNext || isPending}
            onClick={() => updateParams({ page: String(result.pagination.page + 1) }, false)}
            type="button"
          >
            Siguiente
          </button>
        </div>
      </footer>
    </main>
  );
}

function formatPrice(price: number | null, currency: string) {
  if (price === null) {
    return 'Sin precio';
  }

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(price);
}
