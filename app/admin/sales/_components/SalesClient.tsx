'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { duplicateSalesOrder } from '@/modules/sales/commands';
import type {
  SalesListParams,
  SalesOrderListResult,
  SalesOrderStatus,
  SalesOrderStatusFilter,
} from '@/modules/sales/types';
import { SALES_ORDER_STATUSES } from '@/modules/sales/types';
import { SALES_PAGE_SIZE_OPTIONS } from '@/modules/sales/validators';

type SalesClientProps = {
  result: SalesOrderListResult;
  params: SalesListParams;
  tenantSlug: string;
};

const statusLabels: Record<SalesOrderStatus, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'En preparacion',
  delivered: 'Entregado',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
};

const statusOptions: Array<{ value: SalesOrderStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  ...SALES_ORDER_STATUSES.map((status) => ({
    value: status,
    label: statusLabels[status],
  })),
];

export function SalesClient({ result, params, tenantSlug }: SalesClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(params.search);
  const [isPending, startTransition] = useTransition();
  const [isDuplicating, startDuplicating] = useTransition();
  const [duplicatingOrderId, setDuplicatingOrderId] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

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

  function handleDuplicate(orderId: string) {
    setDuplicateError(null);
    setDuplicatingOrderId(orderId);

    startDuplicating(async () => {
      const commandResult = await duplicateSalesOrder({ tenantSlug, orderId });

      if (!commandResult.ok || !commandResult.orderId) {
        setDuplicateError(commandResult.error ?? 'No se pudo duplicar el pedido.');
        setDuplicatingOrderId(null);
        return;
      }

      router.push(`/admin/sales/${commandResult.orderId}`);
    });
  }

  return (
    <main className="sales-page">
      <header className="admin-header sales-header">
        <p className="admin-kicker">Motor comercial</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Pedidos</h1>
            <p className="admin-subtitle">
              Pedidos comerciales con account, lista de precios y snapshots de items.
            </p>
          </div>
          <div className="sales-header-actions">
            <span className="admin-status">{result.pagination.total} registros</span>
            <Link className="product-edit-primary-button sales-new-link" href="/admin/sales/new">
              Nuevo Pedido
            </Link>
          </div>
        </div>
      </header>

      <section className="products-toolbar" aria-label="Filtros de pedidos">
        <label className="products-search">
          <span>Buscar</span>
          <input
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pedido, account o lista"
            type="search"
            value={query}
          />
        </label>

        <div className="sales-filter-grid">
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
            <span>Pagina</span>
            <select
              onChange={(event) => updateParams({ pageSize: event.target.value })}
              value={String(params.pageSize)}
            >
              {SALES_PAGE_SIZE_OPTIONS.map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize} filas
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {isPending ? <div className="products-loading-pill">Actualizando vista</div> : null}

      {duplicateError ? (
        <section className="product-edit-feedback product-edit-feedback-error" role="alert">
          {duplicateError}
        </section>
      ) : null}

      {result.error ? (
        <section className="products-state products-state-error">
          <strong>No se pudieron cargar los pedidos.</strong>
          <p>{result.error}</p>
        </section>
      ) : null}

      {!result.error && result.orders.length === 0 ? (
        <section className="products-state">
          <strong>No hay pedidos para estos filtros.</strong>
          <p>Crea un nuevo pedido o ajusta busqueda, estado o paginacion.</p>
        </section>
      ) : null}

      {!result.error && result.orders.length > 0 ? (
        <section className="sales-list" aria-label="Listado de pedidos">
          <div className="sales-list-head" aria-hidden="true">
            <span>Pedido</span>
            <span>Cliente</span>
            <span>Contenido</span>
            <span>Total</span>
            <span>Estado</span>
            <span>Origen</span>
            <span>Acciones</span>
          </div>

          {result.orders.map((order) => (
            <article className="sales-row" key={order.id}>
              <div className="sales-row-main">
                <span>{shortId(order.id)}</span>
                <h2>
                  <Link className="product-row-title-link" href={`/admin/sales/${order.id}`}>
                    Ver detalle
                  </Link>
                </h2>
                <p>{formatDateTime(order.updatedAt)}</p>
              </div>

              <div className="account-row-muted">
                <span>{order.accountId ? 'Account' : 'Identidad publica'}</span>
                <strong>{order.accountName}</strong>
              </div>

              <div className="sales-row-content">
                <strong>
                  {[order.firstProductName, order.firstProductVariant].filter(Boolean).join(' - ')}
                </strong>
                <span>
                  {order.itemsCount} {order.itemsCount === 1 ? 'item' : 'items'}
                  {order.itemsCount > 1 ? ` · +${order.itemsCount - 1} mas` : ''}
                </span>
              </div>

              <div className="sales-row-total">{formatMoney(order.total, order.currency)}</div>

              <div className="sales-status" data-status={order.status}>
                {statusLabels[order.status]}
              </div>

              <div className="sales-row-source" data-source={order.source}>
                {order.source === 'public_commerce' ? 'Public Commerce' : 'Admin'}
              </div>

              <button
                className="products-muted-button sales-duplicate-button"
                disabled={isDuplicating}
                onClick={() => handleDuplicate(order.id)}
                type="button"
              >
                {duplicatingOrderId === order.id ? 'Duplicando' : 'Duplicar'}
              </button>
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

function shortId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function formatMoney(value: number, currency = 'ARS') {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
