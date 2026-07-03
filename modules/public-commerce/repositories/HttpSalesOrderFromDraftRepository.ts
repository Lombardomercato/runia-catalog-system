import type {
  PersistSalesOrderFromDraftInput,
  PersistSalesOrderFromDraftResult,
  SalesOrderFromDraft,
  SalesOrderFromDraftRepository,
} from '@/core/orders/interfaces';

type ApiSuccess = {
  ok: true;
  order: SalesOrderFromDraft;
  created: boolean;
};

type ApiFailure = {
  ok: false;
  error: string;
};

export class HttpSalesOrderFromDraftRepository implements SalesOrderFromDraftRepository {
  async findByDraft(input: {
    tenantId: string;
    sourceDraftId: string;
    idempotencyKey: string;
  }): Promise<SalesOrderFromDraft | null> {
    const response = await request({ operation: 'find', ...input });
    if (response.status === 404) return null;
    const result = await readResponse(response);
    if (!result.ok) throw new Error(result.error);
    return result.order;
  }

  async createTransactional(
    input: PersistSalesOrderFromDraftInput,
  ): Promise<PersistSalesOrderFromDraftResult> {
    const result = await readResponse(await request({ operation: 'create', payload: input }));
    if (!result.ok) throw new Error(result.error);
    return { order: result.order, created: result.created };
  }
}

async function request(body: unknown) {
  return fetch('/api/public-commerce/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

async function readResponse(response: Response): Promise<ApiSuccess | ApiFailure> {
  const body = (await response.json().catch(() => null)) as ApiSuccess | ApiFailure | null;
  if (!response.ok || !body) {
    return { ok: false, error: 'No se pudo persistir el pedido.' };
  }
  return body;
}
