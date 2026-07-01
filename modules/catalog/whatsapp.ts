import type { CatalogProduct, CatalogTenant } from './types';

export function formatCatalogWhatsAppMessage(tenant: CatalogTenant, product: CatalogProduct) {
  const lines = [
    `Hola ${tenant.commercialName}, quiero consultar por este producto:`,
    '',
    `*${product.name}*`,
  ];
  if (product.variant) lines.push(`Variante: ${product.variant}`);
  if (product.productLine) lines.push(`Linea: ${product.productLine}`);
  lines.push(`Marca: ${product.brandName}`, `SKU: ${product.sku}`);
  if (product.price !== null) {
    lines.push(`Precio: ${formatMoney(product.price, product.currency, tenant.locale)}`);
  }
  return lines.join('\n');
}

export function buildCatalogWhatsAppUrl(phone: string | null, message: string) {
  const normalizedPhone = phone?.replace(/\D/g, '') ?? '';
  if (normalizedPhone.length < 7 || normalizedPhone.length > 15 || !message.trim()) return null;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

function formatMoney(value: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'ARS',
    maximumFractionDigits: 2,
  }).format(value);
}
