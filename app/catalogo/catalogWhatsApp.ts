import type {
  CommerceProductDetail,
  CommerceTenantPublicConfig,
} from '@/sdk/server/types';

export function formatCatalogWhatsAppMessage(
  tenant: CommerceTenantPublicConfig,
  product: CommerceProductDetail,
) {
  const lines = [
    `Hola ${tenant.name}, quiero consultar por este producto:`,
    '',
    `*${product.name}*`,
  ];
  if (product.variant) lines.push(`Variante: ${product.variant}`);
  if (product.productLine) lines.push(`Linea: ${product.productLine}`);
  lines.push(`Marca: ${product.brand.name}`, `SKU: ${product.sku}`);
  lines.push(`Precio: ${formatMoney(product.price.amount, product.price.currency, tenant.locale)}`);
  return lines.join('\n');
}

export function buildCatalogWhatsAppUrl(phone: string | null, message: string) {
  const normalizedPhone = phone?.replace(/\D/g, '') ?? '';
  if (normalizedPhone.length < 7 || normalizedPhone.length > 15 || !message.trim()) return null;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

function formatMoney(value: string, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'ARS',
    maximumFractionDigits: 2,
  }).format(Number(value));
}
