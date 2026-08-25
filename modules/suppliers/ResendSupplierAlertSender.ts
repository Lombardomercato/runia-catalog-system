import 'server-only';

export type SupplierAutomationAlert = {
  runId: string;
  status: string;
  reasons: string[];
  products: number;
  pricesChanged: number;
  blocked: number;
  pendingReview: number;
  supplierOnlyCost: number;
};

export interface SupplierAutomationAlertSender {
  send(alert: SupplierAutomationAlert): Promise<{ providerMessageId: string }>;
}

export class ResendSupplierAlertSender implements SupplierAutomationAlertSender {
  constructor(
    private readonly config: {
      apiKey: string;
      from: string;
      to: string;
    },
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async send(alert: SupplierAutomationAlert) {
    const response = await this.fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': `vinros-sync-alert-${alert.runId}`,
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [this.config.to],
        subject: `VINROS automático: ${alert.status.toUpperCase()}`,
        text: renderAlert(alert),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || typeof payload.id !== 'string' || !payload.id) {
      throw new Error(`RESEND_ALERT_FAILED_HTTP_${response.status}`);
    }
    return { providerMessageId: payload.id };
  }
}

export function createSupplierAutomationAlertSenderFromEnvironment() {
  if (process.env.VINROS_ALERT_EMAIL_ENABLED?.trim().toLowerCase() !== 'true') {
    return null;
  }
  const apiKey = requiredEnvironment('RESEND_API_KEY');
  const from = requiredEnvironment('VINROS_ALERT_EMAIL_FROM');
  const to = requiredEnvironment('VINROS_ALERT_EMAIL_TO').toLowerCase();
  if (!emailPattern.test(to)) throw new Error('VINROS_ALERT_EMAIL_TO no es válido.');
  if (!from.includes('@')) throw new Error('VINROS_ALERT_EMAIL_FROM no es válido.');
  return new ResendSupplierAlertSender({ apiKey, from, to });
}

function renderAlert(alert: SupplierAutomationAlert) {
  return [
    `VINROS automático terminó con estado ${alert.status}.`,
    '',
    ...alert.reasons.map((reason) => `- ${reason}`),
    '',
    `Productos: ${alert.products}`,
    `Precios que cambiarían: ${alert.pricesChanged}`,
    `BLOCKED: ${alert.blocked}`,
    `PENDING_REVIEW: ${alert.pendingReview}`,
    `SUPPLIER_ONLY_COST: ${alert.supplierOnlyCost}`,
    `Run de auditoría: ${alert.runId}`,
    '',
    'El write no se fuerza cuando un guardrail bloquea la ejecución.',
  ].join('\n');
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable server-only ${name}.`);
  return value;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
