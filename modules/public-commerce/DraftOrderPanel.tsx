'use client';

import { usePublicCommerce } from './PublicCommerceProvider';

export function DraftOrderPanel() {
  const {
    tenant,
    draft,
    pending,
    error,
    open,
    setOpen,
    updateQuantity,
    removeProduct,
  } = usePublicCommerce();
  if (!tenant?.enabled) return null;

  const quantity = draft?.summary.totalQuantity ?? 0;
  return (
    <>
      <button
        aria-expanded={open}
        aria-controls="public-commerce-draft-panel"
        className="public-commerce-trigger"
        onClick={() => setOpen(true)}
        type="button"
      >
        Pedido <span>{quantity}</span>
      </button>

      <aside
        className="public-commerce-panel"
        hidden={!open}
        id="public-commerce-draft-panel"
      >
        <header>
          <div><span>Pedido</span><strong>{quantity} productos</strong></div>
          <button aria-label="Cerrar pedido" onClick={() => setOpen(false)} title="Cerrar" type="button">×</button>
        </header>

        <div className="public-commerce-panel-body">
          {pending && !draft ? <p className="public-commerce-state">Cargando...</p> : null}
          {!pending && !draft?.items.length ? <p className="public-commerce-state">El pedido esta vacio.</p> : null}
          {draft?.items.map((item) => (
            <article className="public-commerce-item" key={item.productId}>
              <div><strong>{item.name}</strong>{item.variant ? <span>{item.variant}</span> : null}<small>{item.sku}</small></div>
              <div className="public-commerce-item-controls">
                <div className="public-commerce-stepper" aria-label={`Cantidad de ${item.name}`}>
                  <button aria-label="Reducir cantidad" disabled={pending} onClick={() => void updateQuantity(item.productId, item.quantity - 1)} type="button">−</button>
                  <span>{item.quantity}</span>
                  <button aria-label="Aumentar cantidad" disabled={pending} onClick={() => void updateQuantity(item.productId, item.quantity + 1)} type="button">+</button>
                </div>
                <strong>{formatMoney(item.subtotal, item.currency, tenant.locale)}</strong>
                <button className="public-commerce-remove" disabled={pending} onClick={() => void removeProduct(item.productId)} type="button">Eliminar</button>
              </div>
            </article>
          ))}
          {error ? <p className="public-commerce-error" role="alert">{error}</p> : null}
        </div>

        <footer>
          <dl>
            <div><dt>Subtotal</dt><dd>{formatMoney(draft?.summary.subtotal ?? '0', draft?.summary.currency ?? tenant.currency, tenant.locale)}</dd></div>
            <div><dt>Total</dt><dd>{formatMoney(draft?.summary.total ?? '0', draft?.summary.currency ?? tenant.currency, tenant.locale)}</dd></div>
          </dl>
          <button className="public-commerce-continue" disabled type="button">Continuar</button>
        </footer>
      </aside>
    </>
  );
}

function formatMoney(amount: string, currency: string, locale: string) {
  const value = Number(amount);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'ARS',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}
