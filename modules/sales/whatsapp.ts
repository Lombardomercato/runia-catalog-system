import type { SalesOrderDetail, SalesOrderStatus } from './types';
import { buildSalesOrderWhatsAppUrl } from '@/core/orders/whatsapp';

const statusLabels: Record<SalesOrderStatus, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'En preparacion',
  delivered: 'Entregado',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
};

export function formatSalesOrderWhatsAppMessage(order: SalesOrderDetail) {
  const money = createMoneyFormatter(order.currency);
  const quantity = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 2,
  });
  const lines = [
    `*${order.tenantName}*`,
    `Pedido ${shortOrderId(order.id)}`,
    `Cliente: ${order.accountName}`,
    `Estado: ${statusLabels[order.status]}`,
    `Lista: ${order.priceListName}`,
    `Fecha: ${formatOrderDate(order.createdAt)}`,
    '',
    '*Productos*',
  ];

  order.items.forEach((item, index) => {
    const productName = [item.productNameSnapshot, item.variantSnapshot]
      .filter(Boolean)
      .join(' - ');

    lines.push(
      `${index + 1}. ${quantity.format(item.quantity)} x ${productName} [SKU: ${item.skuSnapshot}]`,
      `   Unitario: ${money.format(item.unitPriceSnapshot)}`,
      `   Subtotal: ${money.format(item.subtotal)}`,
    );
  });

  lines.push('', `Descuento: ${money.format(order.discount)}`, `*Total: ${money.format(order.total)}*`);

  if (order.notes?.trim()) {
    lines.push('', `Notas: ${order.notes.trim()}`);
  }

  return lines.join('\n');
}

export function buildWhatsAppUrl(phone: string, message: string) {
  return buildSalesOrderWhatsAppUrl(phone, message);
}

function createMoneyFormatter(currency: string) {
  const normalizedCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'ARS';

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatOrderDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function shortOrderId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}
