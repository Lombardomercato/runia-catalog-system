'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { createSalesOrder, updateSalesOrder } from '@/modules/sales/commands';
import type {
  SalesCommandResult,
  SalesDraftOptions,
  SalesOrderDetail,
  SalesOrderStatus,
  SalesProductOption,
} from '@/modules/sales/types';
import { SALES_ORDER_STATUSES } from '@/modules/sales/types';
import { SalesOrderActions } from './SalesOrderActions';

type SalesOrderFormProps = {
  tenantSlug: string;
  order: SalesOrderDetail | null;
  options: SalesDraftOptions;
  optionsError: string | null;
  mode: 'create' | 'edit';
};

type SalesItemDraft = {
  localId: string;
  itemId: string | null;
  productId: string;
  label: string;
  sku: string;
  quantity: string;
};

type SalesDraft = {
  accountId: string;
  status: SalesOrderStatus;
  notes: string;
  items: SalesItemDraft[];
};

const MAX_VISIBLE_PRODUCTS = 10;

const statusLabels: Record<SalesOrderStatus, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'En preparacion',
  delivered: 'Entregado',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
};

export function SalesOrderForm({
  tenantSlug,
  order,
  options,
  optionsError,
  mode,
}: SalesOrderFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<SalesDraft>(() => toDraft(order));
  const [priceListOverrideId, setPriceListOverrideId] = useState<string | null>(
    order?.priceListId ?? null,
  );
  const [productSearch, setProductSearch] = useState('');
  const deferredProductSearch = useDeferredValue(productSearch);
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const [result, setResult] = useState<SalesCommandResult | null>(null);
  const [isSaving, startSaving] = useTransition();
  const isCreate = mode === 'create';
  const selectedAccount = options.accounts.find((account) => account.id === draft.accountId) ?? null;
  const defaultPriceList =
    options.priceLists.find((priceList) => priceList.isDefault) ?? options.priceLists[0] ?? null;
  const selectedPriceListId =
    priceListOverrideId ?? selectedAccount?.priceListId ?? defaultPriceList?.id ?? null;
  const selectedPriceList =
    options.priceLists.find((priceList) => priceList.id === selectedPriceListId) ?? null;
  const selectedPriceProductCount = countProductsForPriceList(
    options.products,
    selectedPriceListId,
  );
  const fallbackPriceList = findFallbackPriceList(
    options.priceLists,
    options.products,
    selectedPriceListId,
  );
  const fallbackProductCount = countProductsForPriceList(
    options.products,
    fallbackPriceList?.id ?? null,
  );
  const accountPriceProductCount = countProductsForPriceList(
    options.products,
    selectedAccount?.priceListId ?? null,
  );
  const isUsingFallback = Boolean(
    selectedAccount?.priceListId &&
      selectedPriceListId !== selectedAccount.priceListId &&
      accountPriceProductCount === 0,
  );
  const existingItemById = useMemo(
    () => new Map((order?.items ?? []).map((item) => [item.id, item])),
    [order?.items],
  );
  const filteredProducts = useMemo(
    () => filterProducts(options.products, deferredProductSearch, selectedPriceListId),
    [deferredProductSearch, options.products, selectedPriceListId],
  );
  const visibleProducts = filteredProducts.slice(0, MAX_VISIBLE_PRODUCTS);
  const totals = useMemo(
    () =>
      calculateTotals(
        draft,
        options.products,
        existingItemById,
        selectedPriceListId,
        selectedAccount?.discountPercent ?? 0,
      ),
    [draft, existingItemById, options.products, selectedAccount?.discountPercent, selectedPriceListId],
  );
  const hasUnsavedChanges = useMemo(
    () => hasOrderChanges(draft, order, selectedPriceListId),
    [draft, order, selectedPriceListId],
  );

  const cancelChanges = useCallback(() => {
    setResult(null);
    setProductSearch('');
    setPriceListOverrideId(order?.priceListId ?? null);

    if (isCreate) {
      router.push('/admin/sales');
      return;
    }

    setDraft(toDraft(order));
  }, [isCreate, order, router]);

  useEffect(() => {
    setDraft(toDraft(order));
    setPriceListOverrideId(order?.priceListId ?? null);
  }, [order]);

  useEffect(() => {
    setActiveProductIndex(0);
  }, [deferredProductSearch, selectedPriceListId]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();

        if (!isSaving) {
          formRef.current?.requestSubmit();
        }

        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        cancelChanges();
      }
    }

    document.addEventListener('keydown', handleShortcut);

    return () => document.removeEventListener('keydown', handleShortcut);
  }, [cancelChanges, isSaving]);

  function updateDraft<Key extends keyof SalesDraft>(key: Key, value: SalesDraft[Key]) {
    setResult(null);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function changeAccount(accountId: string) {
    setPriceListOverrideId(null);
    setResult(null);
    setDraft((current) => ({
      ...current,
      accountId,
      items: current.items.map((item) => ({ ...item, itemId: null })),
    }));
  }

  function useFallbackPriceList() {
    if (!fallbackPriceList) {
      return;
    }

    setPriceListOverrideId(fallbackPriceList.id);
    setResult(null);
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => ({ ...item, itemId: null })),
    }));
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function addProduct(product: SalesProductOption) {
    setResult(null);
    setDraft((current) => {
      const existing = current.items.find((item) => item.productId === product.id);

      if (existing) {
        return {
          ...current,
          items: current.items.map((item) =>
            item.localId === existing.localId
              ? { ...item, quantity: String(parsePositiveQuantity(item.quantity) + 1) }
              : item,
          ),
        };
      }

      return {
        ...current,
        items: [
          ...current.items,
          {
            localId: crypto.randomUUID(),
            itemId: null,
            productId: product.id,
            label: buildProductLabel(product),
            sku: product.sku,
            quantity: '1',
          },
        ],
      };
    });
    setProductSearch('');
    setActiveProductIndex(0);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function handleProductSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (visibleProducts.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveProductIndex((current) => Math.min(current + 1, visibleProducts.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveProductIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter' && visibleProducts[activeProductIndex]) {
      event.preventDefault();
      addProduct(visibleProducts[activeProductIndex]);
    }
  }

  function updateItemQuantity(localId: string, quantity: string) {
    setResult(null);
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.localId === localId ? { ...item, quantity } : item,
      ),
    }));
  }

  function removeItem(localId: string) {
    setResult(null);
    setDraft((current) => ({
      ...current,
      items: current.items.filter((item) => item.localId !== localId),
    }));
  }

  function moveItem(localId: string, direction: -1 | 1) {
    setResult(null);
    setDraft((current) => {
      const index = current.items.findIndex((item) => item.localId === localId);
      const targetIndex = index + direction;

      if (index < 0 || targetIndex < 0 || targetIndex >= current.items.length) {
        return current;
      }

      const items = [...current.items];
      [items[index], items[targetIndex]] = [items[targetIndex], items[index]];

      return { ...current, items };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    startSaving(async () => {
      const payload = {
        tenantSlug,
        accountId: draft.accountId,
        priceListId: selectedPriceListId,
        status: draft.status,
        notes: draft.notes,
        items: draft.items.map((item) => ({
          itemId: item.itemId,
          productId: item.productId,
          quantity: item.quantity,
        })),
      };
      const commandResult =
        isCreate || !order
          ? await createSalesOrder(payload)
          : await updateSalesOrder({
              ...payload,
              orderId: order.id,
            });

      setResult(commandResult);

      if (commandResult.ok) {
        if (isCreate && commandResult.orderId) {
          router.push(`/admin/sales/${commandResult.orderId}`);
          return;
        }

        router.refresh();
      }
    });
  }

  return (
    <main className="sales-edit-page">
      <header className="admin-header sales-header">
        <p className="admin-kicker">Motor comercial</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">
              {isCreate ? 'Nuevo Pedido' : `Pedido ${shortId(order?.id ?? '')}`}
            </h1>
            <p className="admin-subtitle">Pedido comercial</p>
          </div>
          <Link className="product-edit-secondary-link" href="/admin/sales">
            Volver al listado
          </Link>
        </div>
      </header>

      {optionsError ? (
        <section className="products-state products-state-error">
          <strong>No se pudieron cargar los datos comerciales.</strong>
          <p>{optionsError}</p>
        </section>
      ) : null}

      <form className="sales-edit-form" onSubmit={handleSubmit} ref={formRef}>
        <div className="sales-order-workspace">
          <div className="sales-order-flow">
            <section className="product-edit-panel">
              <div className="product-edit-panel-header">
                <span>Pedido</span>
              </div>

              <div className="sales-order-fields">
                <label className="product-edit-field">
                  <span>Account</span>
                  <select
                    aria-invalid={Boolean(result?.fieldErrors.accountId)}
                    onChange={(event) => changeAccount(event.target.value)}
                    required
                    value={draft.accountId}
                  >
                    <option value="">Seleccionar account</option>
                    {options.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  {result?.fieldErrors.accountId ? <small>{result.fieldErrors.accountId}</small> : null}
                </label>

                <label className="product-edit-field">
                  <span>Estado</span>
                  <select
                    aria-invalid={Boolean(result?.fieldErrors.status)}
                    onChange={(event) => updateDraft('status', event.target.value as SalesOrderStatus)}
                    value={draft.status}
                  >
                    {SALES_ORDER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                  {result?.fieldErrors.status ? <small>{result.fieldErrors.status}</small> : null}
                </label>
              </div>

              <div className="sales-account-summary">
                <div>
                  <span>Lista del pedido</span>
                  <strong>
                    {selectedPriceList?.name ?? 'Sin lista disponible'}
                    {isUsingFallback ? ' (fallback)' : ''}
                  </strong>
                </div>
                <div>
                  <span>Descuento account</span>
                  <strong>{selectedAccount?.discountPercent ?? 0}%</strong>
                </div>
              </div>

              {result?.fieldErrors.priceListId ? (
                <p className="sales-field-error">{result.fieldErrors.priceListId}</p>
              ) : null}

              <label className="product-edit-field sales-notes-field">
                <span>Notas</span>
                <textarea
                  onChange={(event) => updateDraft('notes', event.target.value)}
                  rows={3}
                  value={draft.notes}
                />
              </label>
            </section>

            <section className="product-edit-panel sales-product-picker">
              <div className="product-edit-panel-header">
                <span>Agregar productos</span>
              </div>

              <div className="sales-product-combobox">
                {options.products.length > 0 && selectedPriceListId && selectedPriceProductCount === 0 ? (
                  <div className="sales-price-list-warning" role="status">
                    <div>
                      <strong>
                        La lista {selectedPriceList?.name ?? 'seleccionada'} no tiene productos con precio.
                      </strong>
                      <p>
                        Hay {options.products.length} productos activos, pero ninguno tiene precio en esta lista.
                      </p>
                    </div>
                    {fallbackPriceList ? (
                      <button onClick={useFallbackPriceList} type="button">
                        Usar {fallbackPriceList.name} ({fallbackProductCount})
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {isUsingFallback && selectedPriceProductCount > 0 ? (
                  <div className="sales-price-list-notice" role="status">
                    Usando {selectedPriceList?.name} porque la lista de la Account no tiene precios disponibles.
                  </div>
                ) : null}

                <label className="products-search sales-product-search">
                  <span>Buscar</span>
                  <input
                    aria-activedescendant={
                      visibleProducts[activeProductIndex]
                        ? `sales-product-${visibleProducts[activeProductIndex].id}`
                        : undefined
                    }
                    aria-autocomplete="list"
                    aria-controls="sales-product-results"
                    aria-expanded={visibleProducts.length > 0}
                    autoComplete="off"
                    onChange={(event) => setProductSearch(event.target.value)}
                    onKeyDown={handleProductSearchKeyDown}
                    placeholder="Nombre, SKU o marca"
                    ref={searchInputRef}
                    role="combobox"
                    type="search"
                    value={productSearch}
                  />
                </label>

                <div
                  className="sales-product-results"
                  id="sales-product-results"
                  role="listbox"
                >
                  {visibleProducts.map((product, index) => {
                    const price = findProductPrice(product, selectedPriceListId);

                    return (
                      <button
                        aria-selected={index === activeProductIndex}
                        data-active={index === activeProductIndex}
                        disabled={!price}
                        id={`sales-product-${product.id}`}
                        key={product.id}
                        onClick={() => addProduct(product)}
                        onMouseEnter={() => setActiveProductIndex(index)}
                        role="option"
                        tabIndex={-1}
                        type="button"
                      >
                        <span>
                          <strong>{product.name}</strong>
                          <small>
                            {[product.sku, product.brandName, product.variant].filter(Boolean).join(' - ')}
                          </small>
                        </span>
                        <em>{price ? formatMoney(price.price) : 'Sin precio'}</em>
                      </button>
                    );
                  })}

                  {visibleProducts.length === 0 ? (
                    <p className="sales-product-empty">
                      {getEmptyProductMessage({
                        activeProducts: options.products.length,
                        selectedPriceListName: selectedPriceList?.name ?? null,
                        selectedPriceListId,
                        selectedPriceProductCount,
                        search: deferredProductSearch,
                      })}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="product-edit-panel sales-items-panel">
              <div className="product-edit-panel-header sales-items-heading">
                <span>Items</span>
                <strong>{draft.items.length}</strong>
              </div>

              {result?.fieldErrors.items ? (
                <p className="sales-field-error">{result.fieldErrors.items}</p>
              ) : null}

              {draft.items.length === 0 ? (
                <section className="products-state sales-items-empty">
                  <strong>Sin items.</strong>
                </section>
              ) : (
                <div className="sales-items-list">
                  {draft.items.map((item, index) => {
                    const line = calculateLine(
                      item,
                      options.products,
                      existingItemById,
                      selectedPriceListId,
                    );

                    return (
                      <article className="sales-item-row" key={item.localId}>
                        <div className="sales-item-reorder">
                          <button
                            aria-label={`Subir ${item.label}`}
                            disabled={index === 0}
                            onClick={() => moveItem(item.localId, -1)}
                            title="Subir item"
                            type="button"
                          >
                            ↑
                          </button>
                          <button
                            aria-label={`Bajar ${item.label}`}
                            disabled={index === draft.items.length - 1}
                            onClick={() => moveItem(item.localId, 1)}
                            title="Bajar item"
                            type="button"
                          >
                            ↓
                          </button>
                        </div>

                        <div className="sales-item-identity">
                          <strong>{item.label}</strong>
                          <span>{item.sku}</span>
                          {result?.fieldErrors[`item.${index}.productId`] ? (
                            <small>{result.fieldErrors[`item.${index}.productId`]}</small>
                          ) : null}
                          {result?.fieldErrors[`item.${index}.price`] ? (
                            <small>{result.fieldErrors[`item.${index}.price`]}</small>
                          ) : null}
                        </div>

                        <label className="sales-item-quantity">
                          <span>Cant.</span>
                          <input
                            aria-invalid={Boolean(result?.fieldErrors[`item.${index}.quantity`])}
                            min="0.01"
                            onChange={(event) => updateItemQuantity(item.localId, event.target.value)}
                            step="0.01"
                            type="number"
                            value={item.quantity}
                          />
                          {result?.fieldErrors[`item.${index}.quantity`] ? (
                            <small>{result.fieldErrors[`item.${index}.quantity`]}</small>
                          ) : null}
                        </label>

                        <div className="sales-item-money">
                          <span>Unitario</span>
                          <strong>{formatMoney(line.unitPrice)}</strong>
                        </div>

                        <div className="sales-item-money sales-item-subtotal">
                          <span>Subtotal</span>
                          <strong>{formatMoney(line.subtotal)}</strong>
                        </div>

                        <button
                          aria-label={`Quitar ${item.label}`}
                          className="sales-item-remove"
                          onClick={() => removeItem(item.localId)}
                          title="Quitar item"
                          type="button"
                        >
                          ×
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="sales-summary-column">
            <section className="product-edit-panel product-edit-side sales-total-panel">
              <div className="product-edit-panel-header">
                <span>Totales</span>
              </div>

              <div className="sales-total-line">
                <span>Cantidad de productos</span>
                <strong>{totals.productCount}</strong>
              </div>
              <div className="sales-total-line">
                <span>Subtotal</span>
                <strong>{formatMoney(totals.subtotal)}</strong>
              </div>
              <div className="sales-total-line">
                <span>Descuento</span>
                <strong>{formatMoney(totals.discount)}</strong>
              </div>
              <div className="sales-total-line sales-total-line-final">
                <span>Total</span>
                <strong>{formatMoney(totals.total)}</strong>
              </div>

              <SalesOrderActions order={order} hasUnsavedChanges={hasUnsavedChanges} />
            </section>
          </aside>
        </div>

        {result?.error ? (
          <section className="product-edit-feedback product-edit-feedback-error" role="alert">
            {result.error}
          </section>
        ) : null}

        {result?.ok ? (
          <section className="product-edit-feedback product-edit-feedback-success" role="status">
            {result.message}
          </section>
        ) : null}

        <footer className="product-edit-actions sales-form-actions">
          <button className="products-muted-button" onClick={cancelChanges} type="button">
            Cancelar
          </button>
          <button className="product-edit-primary-button" disabled={isSaving} type="submit">
            {isSaving ? 'Guardando' : 'Guardar'}
          </button>
        </footer>
      </form>
    </main>
  );
}

function toDraft(order: SalesOrderDetail | null): SalesDraft {
  return {
    accountId: order?.accountId ?? '',
    status: order?.status ?? 'draft',
    notes: order?.notes ?? '',
    items:
      order?.items.map((item) => ({
        localId: item.id,
        itemId: item.id,
        productId: item.productId ?? '',
        label: [item.productNameSnapshot, item.variantSnapshot].filter(Boolean).join(' - '),
        sku: item.skuSnapshot,
        quantity: String(item.quantity),
      })) ?? [],
  };
}

function hasOrderChanges(
  draft: SalesDraft,
  order: SalesOrderDetail | null,
  selectedPriceListId: string | null,
) {
  if (!order) {
    return false;
  }

  const current = {
    accountId: draft.accountId,
    priceListId: selectedPriceListId,
    status: draft.status,
    notes: draft.notes.trim(),
    items: draft.items.map((item) => ({
      productId: item.productId,
      quantity: parsePositiveQuantity(item.quantity),
    })),
  };
  const saved = {
    accountId: order.accountId,
    priceListId: order.priceListId,
    status: order.status,
    notes: order.notes?.trim() ?? '',
    items: order.items.map((item) => ({
      productId: item.productId ?? '',
      quantity: item.quantity,
    })),
  };

  return JSON.stringify(current) !== JSON.stringify(saved);
}

function filterProducts(
  products: SalesProductOption[],
  search: string,
  priceListId: string | null,
) {
  const normalized = normalizeSearchValue(search);

  return products.filter((product) => {
    if (!findProductPrice(product, priceListId)) {
      return false;
    }

    if (!normalized) {
      return true;
    }

    return normalizeSearchValue(
      [product.sku, product.name, product.brandName, product.variant, product.productLine]
        .filter(Boolean)
        .join(' '),
    ).includes(normalized);
  });
}

function countProductsForPriceList(
  products: SalesProductOption[],
  priceListId: string | null,
) {
  if (!priceListId) {
    return 0;
  }

  return products.filter((product) => findProductPrice(product, priceListId)).length;
}

function findFallbackPriceList(
  priceLists: SalesDraftOptions['priceLists'],
  products: SalesProductOption[],
  selectedPriceListId: string | null,
) {
  const availableLists = priceLists.filter(
    (priceList) =>
      priceList.id !== selectedPriceListId &&
      countProductsForPriceList(products, priceList.id) > 0,
  );

  return (
    availableLists.find((priceList) => priceList.isDefault) ??
    availableLists.find((priceList) => priceList.code.toLowerCase() === 'minorista') ??
    null
  );
}

function getEmptyProductMessage({
  activeProducts,
  selectedPriceListName,
  selectedPriceListId,
  selectedPriceProductCount,
  search,
}: {
  activeProducts: number;
  selectedPriceListName: string | null;
  selectedPriceListId: string | null;
  selectedPriceProductCount: number;
  search: string;
}) {
  if (activeProducts === 0) {
    return 'El tenant no tiene productos activos.';
  }

  if (!selectedPriceListId) {
    return 'No hay una lista de precios activa para armar el pedido.';
  }

  if (selectedPriceProductCount === 0) {
    return `La lista ${selectedPriceListName ?? 'seleccionada'} no tiene productos con precio.`;
  }

  if (search.trim()) {
    return `No hay coincidencias para "${search.trim()}" en la lista ${selectedPriceListName ?? 'seleccionada'}.`;
  }

  return `No se encontraron productos utilizables en la lista ${selectedPriceListName ?? 'seleccionada'}.`;
}

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function calculateTotals(
  draft: SalesDraft,
  products: SalesProductOption[],
  existingItemById: Map<string, SalesOrderDetail['items'][number]>,
  priceListId: string | null,
  discountPercent: number,
) {
  const subtotal = roundMoney(
    draft.items.reduce(
      (sum, item) => sum + calculateLine(item, products, existingItemById, priceListId).subtotal,
      0,
    ),
  );
  const discount = roundMoney(subtotal * ((discountPercent || 0) / 100));

  return {
    productCount: draft.items.length,
    subtotal,
    discount,
    total: roundMoney(Math.max(0, subtotal - discount)),
  };
}

function calculateLine(
  item: SalesItemDraft,
  products: SalesProductOption[],
  existingItemById: Map<string, SalesOrderDetail['items'][number]>,
  priceListId: string | null,
) {
  const quantity = Number.parseFloat(item.quantity || '0');
  const existing = item.itemId ? existingItemById.get(item.itemId) : null;
  const product = products.find((candidate) => candidate.id === item.productId) ?? null;
  const price = existing?.unitPriceSnapshot ?? findProductPrice(product, priceListId)?.price ?? 0;
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;

  return {
    unitPrice: price,
    subtotal: roundMoney(price * safeQuantity),
  };
}

function findProductPrice(product: SalesProductOption | null, priceListId: string | null) {
  if (!product || !priceListId) {
    return null;
  }

  return product.prices.find((price) => price.priceListId === priceListId) ?? null;
}

function buildProductLabel(product: SalesProductOption) {
  return [product.name, product.variant].filter(Boolean).join(' - ');
}

function parsePositiveQuantity(value: string) {
  const parsed = Number.parseFloat(value || '0');

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function shortId(id: string) {
  return id ? `#${id.slice(0, 8).toUpperCase()}` : '';
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
