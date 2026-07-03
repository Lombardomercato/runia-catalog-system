'use client';

import { useState } from 'react';
import { writeClipboard } from '@/lib/writeClipboard';
import { formatPublicCommerceMoney } from '../formatMoney';
import { usePublicCommerce } from '../PublicCommerceProvider';

type DraftConfirmationProps = {
  onEditIdentity(): void;
  onEditItems(): void;
};

export function DraftConfirmation({ onEditIdentity, onEditItems }: DraftConfirmationProps) {
  const {
    tenant,
    draft,
    pending,
    error,
    salesOrderId,
    whatsappReceipt,
    whatsappError,
    confirmDraft,
    submitDraft,
  } = usePublicCommerce();
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  if (!tenant || !draft?.identity) return null;

  const confirmed = draft.status === 'ready_to_submit';
  const submitted = draft.status === 'submitted';
  const identity = draft.identity;
  const money = (amount: string) => formatPublicCommerceMoney(
    amount,
    draft.summary.currency,
    tenant.locale,
  );

  const openWhatsApp = () => {
    setActionFeedback(null);
    if (!whatsappReceipt?.whatsappUrl) return;
    window.open(whatsappReceipt.whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const copyMessage = async () => {
    setActionFeedback(null);
    if (!whatsappReceipt?.message) return;
    try {
      await writeClipboard(whatsappReceipt.message);
      setActionFeedback('Mensaje copiado.');
    } catch {
      setActionFeedback('No se pudo copiar el mensaje.');
    }
  };

  return (
    <div className="public-commerce-confirmation">
      {submitted ? (
        <p className="public-commerce-success" role="status">
          Pedido recibido{salesOrderId ? `: #${salesOrderId.slice(0, 8).toUpperCase()}` : ''}.
        </p>
      ) : confirmed ? (
        <p className="public-commerce-success" role="status">
          Draft confirmado. Ya puede convertirse en un pedido real.
        </p>
      ) : (
        <p className="public-commerce-identity-intro">
          Revisa los datos antes de confirmar. Todavia no se creara un pedido real.
        </p>
      )}

      <section>
        <div className="public-commerce-confirmation-heading">
          <h3>Datos del cliente</h3>
          <button disabled={pending || submitted} onClick={onEditIdentity} type="button">Editar</button>
        </div>
        <dl>
          <div><dt>Nombre</dt><dd>{identity.name}</dd></div>
          {identity.company ? <div><dt>Empresa</dt><dd>{identity.company}</dd></div> : null}
          <div><dt>WhatsApp</dt><dd>{identity.whatsapp}</dd></div>
          {identity.email ? <div><dt>Email</dt><dd>{identity.email}</dd></div> : null}
          {identity.cuit ? <div><dt>CUIT</dt><dd>{identity.cuit}</dd></div> : null}
        </dl>
      </section>

      <section>
        <div className="public-commerce-confirmation-heading">
          <h3>Productos</h3>
          <button disabled={pending || submitted} onClick={onEditItems} type="button">Editar</button>
        </div>
        <div className="public-commerce-confirmation-items">
          {draft.items.map((item) => (
            <div key={item.productId}>
              <span>{item.quantity} x {item.name}{item.variant ? ` / ${item.variant}` : ''}</span>
              <strong>{money(item.subtotal)}</strong>
            </div>
          ))}
        </div>
      </section>

      {identity.notes ? (
        <section>
          <h3>Observaciones</h3>
          <p>{identity.notes}</p>
        </section>
      ) : null}

      <section className="public-commerce-confirmation-total">
        <dl>
          <div><dt>Subtotal</dt><dd>{money(draft.summary.subtotal)}</dd></div>
          <div><dt>Descuento</dt><dd>{money(draft.summary.discount)}</dd></div>
          <div><dt>Total</dt><dd>{money(draft.summary.total)}</dd></div>
        </dl>
      </section>

      {error ? <p className="public-commerce-error" role="alert">{error}</p> : null}
      {submitted ? (
        <div className="public-commerce-whatsapp-actions">
          <button
            className="public-commerce-continue"
            disabled={!whatsappReceipt?.whatsappUrl}
            onClick={openWhatsApp}
            type="button"
          >
            Abrir WhatsApp
          </button>
          <button
            className="public-commerce-copy-message"
            disabled={!whatsappReceipt?.message}
            onClick={() => void copyMessage()}
            type="button"
          >
            Copiar mensaje
          </button>
          {whatsappReceipt && !whatsappReceipt.destinationConfigured ? (
            <p className="public-commerce-whatsapp-notice" role="status">
              El negocio no tiene un WhatsApp configurado. Puedes copiar el mensaje.
            </p>
          ) : null}
          {whatsappError ? (
            <p className="public-commerce-error" role="alert">{whatsappError}</p>
          ) : null}
          {actionFeedback ? (
            <p className="public-commerce-whatsapp-feedback" role="status">{actionFeedback}</p>
          ) : null}
        </div>
      ) : (
        <button
          className="public-commerce-continue"
          disabled={pending}
          onClick={() => void (confirmed ? submitDraft() : confirmDraft())}
          type="button"
        >
          {pending
            ? confirmed ? 'Creando pedido...' : 'Confirmando...'
            : confirmed ? 'Crear pedido'
            : 'Confirmar pedido'}
        </button>
      )}
    </div>
  );
}
