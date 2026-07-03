'use client';

import { useState } from 'react';
import { DraftConfirmation } from './confirmation';
import { formatPublicCommerceMoney } from './formatMoney';
import { DraftIdentityForm } from './identity';
import { usePublicCommerce } from './PublicCommerceProvider';

export function DraftOrderPanel() {
  const [stage, setStage] = useState<'items' | 'identity' | 'confirmation'>('items');
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
  const close = () => {
    setStage('items');
    setOpen(false);
  };

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

      <aside className="public-commerce-panel" hidden={!open} id="public-commerce-draft-panel">
        <header>
          <div>
            <span>{stage === 'items' ? 'Pedido' : stage === 'identity' ? 'Datos del pedido' : 'Confirmacion'}</span>
            <strong>{quantity} productos</strong>
          </div>
          <button aria-label="Cerrar pedido" onClick={close} title="Cerrar" type="button">X</button>
        </header>

        {stage === 'identity' ? (
          <div className="public-commerce-panel-body">
            <DraftIdentityForm
              onBack={() => setStage('items')}
              onPrepared={() => setStage('confirmation')}
            />
          </div>
        ) : stage === 'confirmation' ? (
          <div className="public-commerce-panel-body">
            <DraftConfirmation
              onEditIdentity={() => setStage('identity')}
              onEditItems={() => setStage('items')}
            />
          </div>
        ) : (
          <>
            <div className="public-commerce-panel-body">
              {pending && !draft ? <p className="public-commerce-state">Cargando...</p> : null}
              {!pending && !draft?.items.length ? <p className="public-commerce-state">El pedido esta vacio.</p> : null}
              {draft?.items.map((item) => (
                <article className="public-commerce-item" key={item.productId}>
                  <div>
                    <strong>{item.name}</strong>
                    {item.variant ? <span>{item.variant}</span> : null}
                    <small>{item.sku}</small>
                  </div>
                  <div className="public-commerce-item-controls">
                    <div className="public-commerce-stepper" aria-label={`Cantidad de ${item.name}`}>
                      <button aria-label="Reducir cantidad" disabled={pending || draft.status === 'submitted'} onClick={() => void updateQuantity(item.productId, item.quantity - 1)} type="button">-</button>
                      <span>{item.quantity}</span>
                      <button aria-label="Aumentar cantidad" disabled={pending || draft.status === 'submitted'} onClick={() => void updateQuantity(item.productId, item.quantity + 1)} type="button">+</button>
                    </div>
                    <strong>{formatPublicCommerceMoney(item.subtotal, item.currency, tenant.locale)}</strong>
                    <button className="public-commerce-remove" disabled={pending || draft.status === 'submitted'} onClick={() => void removeProduct(item.productId)} type="button">Eliminar</button>
                  </div>
                </article>
              ))}
              {error ? <p className="public-commerce-error" role="alert">{error}</p> : null}
            </div>

            <footer>
              <dl>
                <div><dt>Subtotal</dt><dd>{formatPublicCommerceMoney(draft?.summary.subtotal ?? '0', draft?.summary.currency ?? tenant.currency, tenant.locale)}</dd></div>
                <div><dt>Total</dt><dd>{formatPublicCommerceMoney(draft?.summary.total ?? '0', draft?.summary.currency ?? tenant.currency, tenant.locale)}</dd></div>
              </dl>
              <button
                className="public-commerce-continue"
                disabled={pending || !draft?.items.length}
                onClick={() => setStage(draft?.identity ? 'confirmation' : 'identity')}
                type="button"
              >
                Continuar
              </button>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}
