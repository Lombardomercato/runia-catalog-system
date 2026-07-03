'use client';

import { useMemo, useState } from 'react';
import { writeClipboard } from '@/lib/writeClipboard';
import type { SalesOrderDetail } from '@/modules/sales/types';
import {
  buildWhatsAppUrl,
  formatSalesOrderWhatsAppMessage,
} from '@/modules/sales/whatsapp';

type SalesOrderActionsProps = {
  order: SalesOrderDetail | null;
  hasUnsavedChanges: boolean;
};

export function SalesOrderActions({ order, hasUnsavedChanges }: SalesOrderActionsProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const isSavedOrder = Boolean(order?.id && order.items.length > 0);
  const message = useMemo(
    () => (order && isSavedOrder ? formatSalesOrderWhatsAppMessage(order) : null),
    [isSavedOrder, order],
  );
  const whatsappUrl =
    order?.accountWhatsapp && message
      ? buildWhatsAppUrl(order.accountWhatsapp, message)
      : null;
  const actionsEnabled = isSavedOrder && !hasUnsavedChanges;
  const notice = getActionNotice(order, hasUnsavedChanges, whatsappUrl);

  function openWhatsApp() {
    if (!whatsappUrl || !actionsEnabled) {
      return;
    }

    const openedWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');

    if (openedWindow) {
      openedWindow.opener = null;
    }
  }

  async function copyMessage() {
    if (!message || !actionsEnabled) {
      return;
    }

    try {
      await writeClipboard(message);
      setFeedback('Mensaje copiado.');
    } catch {
      setFeedback('No se pudo copiar el mensaje.');
    }
  }

  return (
    <div className="sales-order-actions" data-order-id={order?.id ?? undefined}>
      <button
        className="products-muted-button sales-whatsapp-button"
        data-channel="whatsapp"
        disabled={!actionsEnabled || !whatsappUrl}
        onClick={openWhatsApp}
        type="button"
      >
        Abrir WhatsApp
      </button>
      <button
        className="products-muted-button sales-copy-button"
        disabled={!actionsEnabled || !message}
        onClick={copyMessage}
        type="button"
      >
        Copiar mensaje
      </button>

      {notice ? <p className="sales-action-notice">{notice}</p> : null}
      {feedback ? (
        <p className="sales-action-feedback" role="status">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}

function getActionNotice(
  order: SalesOrderDetail | null,
  hasUnsavedChanges: boolean,
  whatsappUrl: string | null,
) {
  if (!order) {
    return 'Guarda el pedido para habilitar estas acciones.';
  }

  if (order.items.length === 0) {
    return 'El pedido necesita al menos un item.';
  }

  if (hasUnsavedChanges) {
    return 'Guarda los cambios antes de compartir el pedido.';
  }

  if (!order.accountWhatsapp) {
    return 'El cliente no tiene un WhatsApp cargado. Puedes copiar el mensaje.';
  }

  if (!whatsappUrl) {
    return 'El WhatsApp del cliente no tiene un formato valido.';
  }

  return null;
}
