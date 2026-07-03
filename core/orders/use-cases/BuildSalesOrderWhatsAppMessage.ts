import { ordersFailure } from '../draftOrder';
import type { OrdersResult } from '../errors';
import type {
  BuildSalesOrderWhatsAppMessageInput,
  SalesOrderFromDraft,
  SalesOrderWhatsAppMessage,
} from '../interfaces';

export class BuildSalesOrderWhatsAppMessage {
  execute(
    input: BuildSalesOrderWhatsAppMessageInput,
  ): OrdersResult<SalesOrderWhatsAppMessage> {
    const { order } = input;
    const locale = normalizeLocale(input.locale);
    if (
      !order.id.trim() ||
      !order.commercial.tenantName.trim() ||
      !order.identity.name.trim() ||
      !order.identity.whatsapp.trim() ||
      !order.items.length ||
      !validDate(order.createdAt)
    ) {
      return ordersFailure('INVALID_INPUT', 'The sales order snapshot is incomplete.');
    }

    const currency = normalizeCurrency(order.commercial.currency);
    if (
      !currency ||
      order.total.currency !== currency ||
      order.subtotal.currency !== currency ||
      order.discount.currency !== currency ||
      !validAmount(order.total.amount)
    ) {
      return ordersFailure('CURRENCY_MISMATCH', 'The sales order totals are invalid.');
    }

    for (const item of order.items) {
      if (
        !item.sku.trim() ||
        !item.name.trim() ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.unitPrice.currency !== currency ||
        item.subtotal.currency !== currency ||
        !validAmount(item.unitPrice.amount) ||
        !validAmount(item.subtotal.amount)
      ) {
        return ordersFailure('INVALID_INPUT', 'A sales order item snapshot is invalid.');
      }
    }

    const shortOrderId = `#${order.id.slice(0, 8).toUpperCase()}`;
    const money = createMoneyFormatter(locale, currency);
    const quantity = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const lines = [
      `*${order.commercial.tenantName}*`,
      `Pedido ${shortOrderId}`,
      `Cliente: ${identityName(order)}`,
      `WhatsApp: ${order.identity.whatsapp}`,
      `Fecha: ${formatDate(order.createdAt, locale)}`,
      '',
      '*Productos*',
    ];

    order.items.forEach((item, index) => {
      const product = [item.name, item.variant].filter(Boolean).join(' - ');
      lines.push(
        `${index + 1}. ${quantity.format(item.quantity)} x ${product} [SKU: ${item.sku}]`,
        `   Unitario: ${money.format(Number(item.unitPrice.amount))}`,
        `   Subtotal: ${money.format(Number(item.subtotal.amount))}`,
      );
    });

    lines.push('', `Subtotal: ${money.format(Number(order.subtotal.amount))}`);
    if (Number(order.discount.amount) > 0) {
      lines.push(`Descuento: ${money.format(Number(order.discount.amount))}`);
    }
    lines.push(`*Total: ${money.format(Number(order.total.amount))}*`);

    if (order.notes?.trim()) lines.push('', `Observaciones: ${order.notes.trim()}`);

    return {
      ok: true,
      value: { orderId: order.id, shortOrderId, message: lines.join('\n') },
    };
  }
}

function identityName(order: SalesOrderFromDraft) {
  return order.identity.company
    ? `${order.identity.name} / ${order.identity.company}`
    : order.identity.name;
}

function createMoneyFormatter(locale: string, currency: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function validDate(value: string) {
  return !Number.isNaN(new Date(value).getTime());
}

function validAmount(value: string) {
  return /^\d+(?:\.\d+)?$/.test(value.trim()) && Number.isFinite(Number(value));
}

function normalizeCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function normalizeLocale(value?: string) {
  try {
    return Intl.getCanonicalLocales(value?.trim() || 'es-AR')[0] ?? 'es-AR';
  } catch {
    return 'es-AR';
  }
}
