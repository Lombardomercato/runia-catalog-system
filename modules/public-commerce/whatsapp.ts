import type { PublicCommerceWhatsAppReceipt } from './types';

export async function requestPublicSalesOrderWhatsApp(input: {
  tenantId: string;
  sourceDraftId: string;
  idempotencyKey: string;
  locale: string;
}): Promise<{ receipt: PublicCommerceWhatsAppReceipt | null; error: string | null }> {
  try {
    const response = await fetch('/api/public-commerce/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'build_whatsapp', ...input }),
      cache: 'no-store',
    });
    const body = await response.json() as {
      ok?: boolean;
      receipt?: PublicCommerceWhatsAppReceipt;
      error?: string;
    };
    if (!response.ok || !body.ok || !body.receipt) {
      return { receipt: null, error: body.error ?? 'No se pudo preparar WhatsApp.' };
    }
    return { receipt: body.receipt, error: null };
  } catch {
    return { receipt: null, error: 'No se pudo preparar WhatsApp.' };
  }
}
