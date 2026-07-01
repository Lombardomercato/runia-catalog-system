'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  AccountFiltersResult,
  AccountListParams,
  AccountListResult,
  AccountStatus,
  AccountStatusFilter,
} from '@/modules/accounts/types';
import { ACCOUNT_PAGE_SIZE_OPTIONS } from '@/modules/accounts/validators';

type AccountsClientProps = {
  result: AccountListResult;
  filters: AccountFiltersResult;
  params: AccountListParams;
};

const statusOptions: Array<{ value: AccountStatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Inactivas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'blocked', label: 'Bloqueadas' },
];

const statusLabels: Record<AccountStatus, string> = {
  active: 'Activa',
  inactive: 'Inactiva',
  pending: 'Pendiente',
  blocked: 'Bloqueada',
};

export function AccountsClient({ result, filters, params }: AccountsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(params.search);
  const [isPending, startTransition] = useTransition();
  const accounts = result.accounts;
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
    const timer = window.setTimeout(() => {
      if (query === params.search) {
        return;
      }

      updateParams({ q: query.trim() || null });
    }, 260);

    return () => window.clearTimeout(timer);
  }, [params.search, query, updateParams]);

  return (
    <main className="accounts-page">
      <header className="admin-header accounts-header">
        <p className="admin-kicker">Commerce</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Accounts</h1>
            <p className="admin-subtitle">
              Entidades comerciales con lista de precios y capacidad futura de pedido.
            </p>
          </div>
          <div className="accounts-header-actions">
            <span className="admin-status">{result.pagination.total} registros</span>
            <Link className="product-edit-primary-button accounts-new-link" href="/admin/accounts/new">
              Nueva account
            </Link>
          </div>
        </div>
      </header>

      <section className="products-toolbar" aria-label="Filtros de accounts">
        <label className="products-search">
          <span>Buscar</span>
          <input
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nombre, razon social, CUIT, email o WhatsApp"
            type="search"
            value={query}
          />
        </label>

        <div className="accounts-filter-grid">
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
            <span>Lista de precios</span>
            <select
              onChange={(event) => updateParams({ priceList: event.target.value })}
              value={params.priceListId}
            >
              <option value="all">Todas</option>
              {filters.priceLists.map((priceList) => (
                <option key={priceList.id} value={priceList.id}>
                  {priceList.name}
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
              {ACCOUNT_PAGE_SIZE_OPTIONS.map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize} filas
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {isPending ? <div className="products-loading-pill">Actualizando vista</div> : null}

      {error ? (
        <section className="products-state products-state-error">
          <strong>No se pudo cargar accounts.</strong>
          <p>{error}</p>
        </section>
      ) : null}

      {!error && accounts.length === 0 ? (
        <section className="products-state">
          <strong>No hay accounts para estos filtros.</strong>
          <p>Crea una nueva account o ajusta busqueda, estado o lista de precios.</p>
        </section>
      ) : null}

      {!error && accounts.length > 0 ? (
        <section className="accounts-list" aria-label="Listado de accounts">
          <div className="accounts-list-head" aria-hidden="true">
            <span>Account</span>
            <span>Identificacion</span>
            <span>Contacto</span>
            <span>Lista</span>
            <span>Estado</span>
          </div>

          {accounts.map((account) => (
            <article className="account-row" key={account.id}>
              <div className="account-row-main">
                <h2>
                  <Link className="product-row-title-link" href={`/admin/accounts/${account.id}`}>
                    {account.name}
                  </Link>
                </h2>
                <p>{account.legalName || 'Sin razon social'}</p>
              </div>

              <div className="account-row-muted">
                <span>CUIT</span>
                <strong>{account.taxId || 'Sin datos'}</strong>
              </div>

              <div className="account-row-contact">
                <strong>{account.whatsapp || 'Sin WhatsApp'}</strong>
                <span>{account.email || 'Sin email'}</span>
              </div>

              <div className="account-row-muted">
                <span>Lista</span>
                <strong>{account.priceListName || 'Sin lista'}</strong>
              </div>

              <div className="product-row-status" data-active={account.isActive}>
                {statusLabels[account.status]}
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
