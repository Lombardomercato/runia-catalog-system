'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { duplicateSalesOrder, updateSalesOrderStatus } from '@/modules/sales/commands';
import type { SalesOrderDetail, SalesOrderStatus } from '@/modules/sales/types';
import { canCancelSalesOrder, getNextSalesOrderStatus } from '@/modules/sales/validators';
import { SalesOrderActions } from './SalesOrderActions';

type SalesOrderDetailActionsProps = {
  order: SalesOrderDetail;
  tenantSlug: string;
};

export function SalesOrderDetailActions({ order, tenantSlug }: SalesOrderDetailActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const nextStatus = getNextSalesOrderStatus(order.status);

  function duplicate() {
    setError(null);
    setFeedback(null);
    startTransition(async () => {
      const result = await duplicateSalesOrder({ tenantSlug, orderId: order.id });
      if (!result.ok || !result.orderId) {
        setError(result.error ?? 'No se pudo duplicar el pedido.');
        return;
      }
      router.push(`/admin/sales/${result.orderId}`);
    });
  }

  function changeStatus(status: SalesOrderStatus) {
    if (status === 'cancelled' && !window.confirm('¿Cancelar este pedido? Esta accion no se puede revertir.')) {
      return;
    }
    setError(null);
    setFeedback(null);
    startTransition(async () => {
      const result = await updateSalesOrderStatus({ tenantSlug, orderId: order.id, status });
      if (!result.ok) setError(result.error ?? 'No se pudo actualizar el estado.');
      else setFeedback(result.message ?? 'Estado actualizado.');
      router.refresh();
    });
  }

  return (
    <div className="sales-detail-actions">
      <div className="sales-status-actions">
        <span>Flujo del pedido</span>
        {nextStatus ? (
          <button
            className="product-edit-primary-button"
            disabled={isPending}
            onClick={() => changeStatus(nextStatus)}
            type="button"
          >
            {isPending ? 'Actualizando' : nextActionLabel[nextStatus]}
          </button>
        ) : (
          <p>{order.status === 'closed' ? 'Pedido cerrado.' : 'Pedido cancelado.'}</p>
        )}
        {canCancelSalesOrder(order.status) ? (
          <button
            className="products-muted-button sales-cancel-order"
            disabled={isPending}
            onClick={() => changeStatus('cancelled')}
            type="button"
          >
            Cancelar pedido
          </button>
        ) : null}
      </div>
      {order.accountId ? (
        <Link className="product-edit-primary-button" href={`/admin/sales/${order.id}?edit=1`}>
          Editar pedido
        </Link>
      ) : null}
      <button
        className="products-muted-button"
        disabled={isPending}
        onClick={duplicate}
        type="button"
      >
        {isPending ? 'Duplicando' : 'Duplicar como borrador'}
      </button>
      <SalesOrderActions hasUnsavedChanges={false} order={order} />
      {error ? <p className="sales-action-notice" role="alert">{error}</p> : null}
      {feedback ? <p className="sales-action-feedback" role="status">{feedback}</p> : null}
    </div>
  );
}

const nextActionLabel: Partial<Record<SalesOrderStatus, string>> = {
  pending: 'Marcar pendiente',
  confirmed: 'Confirmar pedido',
  preparing: 'Marcar en preparacion',
  delivered: 'Marcar entregado',
  closed: 'Cerrar pedido',
};
