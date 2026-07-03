export function buildSalesOrderWhatsAppUrl(phone: string, message: string) {
  const normalizedPhone = phone.replace(/\D/g, '');
  if (normalizedPhone.length < 7 || normalizedPhone.length > 15 || !message.trim()) {
    return null;
  }
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}
