import { NextResponse } from 'next/server';
import {
  buildPublicSalesOrderWhatsApp,
  findPersistedPublicSalesOrder,
  persistPublicSalesOrder,
} from '@/modules/public-commerce/server/publicSalesOrderPersistence';
import type { PersistSalesOrderFromDraftInput } from '@/core/orders/interfaces';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 262_144) return failure('Solicitud demasiado extensa.', 413);
    const body = await request.json() as unknown;
    if (
      !isRecord(body) ||
      (body.operation !== 'find' &&
        body.operation !== 'create' &&
        body.operation !== 'build_whatsapp')
    ) {
      return failure('Solicitud invalida.', 400);
    }

    if (body.operation === 'find' || body.operation === 'build_whatsapp') {
      const tenantId = stringValue(body.tenantId);
      const sourceDraftId = stringValue(body.sourceDraftId);
      const idempotencyKey = stringValue(body.idempotencyKey);
      if (!tenantId || !sourceDraftId || !idempotencyKey) return failure('Contexto invalido.', 400);
      if (body.operation === 'build_whatsapp') {
        const receipt = await buildPublicSalesOrderWhatsApp({
          tenantId,
          sourceDraftId,
          idempotencyKey,
          locale: stringValue(body.locale) || 'es-AR',
        });
        return NextResponse.json({ ok: true, receipt });
      }
      const order = await findPersistedPublicSalesOrder({
        tenantId,
        sourceDraftId,
        idempotencyKey,
      });
      return order
        ? NextResponse.json({ ok: true, order, created: false })
        : failure('Pedido no encontrado.', 404);
    }

    if (!isPersistenceInput(body.payload)) return failure('Snapshot invalido.', 400);
    const result = await persistPublicSalesOrder(body.payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo persistir el pedido.';
    const status = message.includes('IDEMPOTENCY_CONFLICT') ? 409 : 422;
    return failure(publicErrorMessage(message), status);
  }
}

function isPersistenceInput(value: unknown): value is PersistSalesOrderFromDraftInput {
  if (!isRecord(value) || !isRecord(value.identity) || !isRecord(value.commercial)) return false;
  return (
    Boolean(stringValue(value.tenantId)) &&
    Boolean(stringValue(value.sourceDraftId)) &&
    Boolean(stringValue(value.idempotencyKey)) &&
    Boolean(stringValue(value.identity.name)) &&
    Boolean(stringValue(value.identity.whatsapp)) &&
    Boolean(stringValue(value.commercial.priceListId)) &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.length <= 200 &&
    isRecord(value.draftSnapshot)
  );
}

function publicErrorMessage(message: string) {
  if (message.includes('IDEMPOTENCY_CONFLICT')) {
    return 'La clave de idempotencia ya pertenece a otro pedido.';
  }
  if (message.includes('TENANT_INACTIVE_OR_NOT_FOUND')) {
    return 'El comercio no esta disponible.';
  }
  if (message.includes('PUBLIC_PRICE_LIST_INVALID')) {
    return 'La lista de precios ya no esta disponible.';
  }
  if (message.includes('PUBLIC_ORDER_')) {
    return 'El pedido contiene datos que deben revisarse.';
  }
  if (message.includes('PUBLIC_SALES_ORDER_NOT_FOUND')) {
    return 'No se encontro el pedido creado.';
  }
  if (message.includes('PUBLIC_TENANT_NOT_FOUND')) {
    return 'El comercio no esta disponible.';
  }
  if (message.includes('WHATSAPP_')) {
    return 'No se pudo preparar el mensaje de WhatsApp.';
  }
  return 'No se pudo crear el pedido.';
}

function failure(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
