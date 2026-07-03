export function formatPublicCommerceMoney(amount: string, currency: string, locale: string) {
  const value = Number(amount);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'ARS',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}
