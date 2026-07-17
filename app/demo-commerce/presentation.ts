export function formatDemoMoney(
  money: { amount: string; currency: string },
  locale: string,
) {
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return `${money.amount} ${money.currency}`;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    maximumFractionDigits: 2,
  }).format(amount);
}
