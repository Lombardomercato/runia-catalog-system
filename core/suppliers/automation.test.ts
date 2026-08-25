import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  evaluateSupplierAutomationReport,
  supplierReportsMatch,
  VINROS_PRODUCTION_POLICY,
} from './automation';
import {
  SUPPLIER_PRICE_TYPES,
  type SupplierDryRunReport,
  type SupplierSyncResult,
} from './types';
import { VinrosAutomationRunner } from '../../modules/suppliers/vinros-automation';
import {
  ResendSupplierAlertSender,
  type SupplierAutomationAlertSender,
} from '../../modules/suppliers/ResendSupplierAlertSender';
import type {
  SupplierAutomationRunFinish,
  SupplierAutomationRunStore,
} from '../../modules/suppliers/SupabaseSupplierAutomationRepository';

test('ejecución normal hace dry-run, revalida y escribe una sola vez', async () => {
  const store = new FakeStore();
  const calls: boolean[] = [];
  const report = approvedReport({ pricesChanging: 12, pricesUnchanged: 13_471 });
  const runner = new VinrosAutomationRunner({
    store,
    alertSender: new FakeAlertSender(),
    executeSync: async ({ dryRun, beforeWrite }) => {
      calls.push(dryRun);
      if (dryRun) return report;
      await beforeWrite?.(report);
      return writeResult(report, { pricesUpdated: 12, pricesUnchanged: 13_471 });
    },
  });

  const result = await runner.execute('test');
  assert.deepEqual(calls, [true, false]);
  assert.equal(result.wrote, true);
  assert.equal(store.finishes[0].status, 'completed_with_warnings');
  assert.equal(store.finishes[0].pricesChanged, 12);
});

test('fuente caída queda BLOCKED, se audita, alerta y no ejecuta write', async () => {
  const store = new FakeStore();
  const alert = new FakeAlertSender();
  const report = approvedReport();
  report.canWrite = false;
  report.lists.cost.integrityStatus = 'blocking';
  report.lists.cost.rowsTotal = 0;
  report.lists.cost.rowsValid = 0;
  report.lists.cost.contentFingerprint = null;
  let calls = 0;
  const runner = new VinrosAutomationRunner({
    store,
    alertSender: alert,
    executeSync: async () => { calls += 1; return report; },
  });

  const result = await runner.execute('test');
  assert.equal(result.status, 'blocked');
  assert.equal(result.wrote, false);
  assert.equal(calls, 1);
  assert.equal(store.finishes[0].status, 'blocked');
  assert.equal(alert.calls, 1);
});

test('un fallo del proveedor de alertas no altera el bloqueo seguro del sync', async () => {
  const store = new FakeStore();
  const report = approvedReport();
  report.canWrite = false;
  const runner = new VinrosAutomationRunner({
    store,
    alertSender: {
      async send() { throw new Error('PROVIDER_UNAVAILABLE'); },
    },
    executeSync: async () => report,
  });

  const result = await runner.execute('test');
  assert.equal(result.status, 'blocked');
  assert.equal(result.wrote, false);
  assert.equal(result.alertStatus, 'failed');
  assert.equal(store.alerts.length, 1);
  assert.equal(store.alerts[0].status, 'failed');
});

test('baseline fuera de rango activa circuit breaker', () => {
  const report = approvedReport();
  report.lists.retail.rowsValid = Math.floor(
    VINROS_PRODUCTION_POLICY.approvedListRows.retail * 0.8,
  );
  const decision = evaluateSupplierAutomationReport(report);
  assert.equal(decision.canWrite, false);
  assert.ok(decision.blockingReasons.some((reason) => reason.includes('retail')));
});

test('cambios de precios alertan sobre 5% y bloquean sobre 25%', () => {
  const alertReport = approvedReport({ pricesChanging: 900, pricesUnchanged: 12_583 });
  const alertDecision = evaluateSupplierAutomationReport(alertReport);
  assert.equal(alertDecision.canWrite, true);
  assert.ok(alertDecision.alertReasons.some((reason) => reason.includes('900 precios')));

  const blockingReport = approvedReport({ pricesChanging: 4_000, pricesUnchanged: 9_483 });
  const blockingDecision = evaluateSupplierAutomationReport(blockingReport);
  assert.equal(blockingDecision.canWrite, false);
  assert.ok(blockingDecision.blockingReasons.some((reason) => reason.includes('precios promovibles')));
});

test('segunda ejecución concurrente se registra como skipped sin descargar fuentes', async () => {
  const store = new FakeStore();
  store.claimed = false;
  let calls = 0;
  const runner = new VinrosAutomationRunner({
    store,
    alertSender: null,
    executeSync: async () => { calls += 1; return approvedReport(); },
  });
  const result = await runner.execute('test');
  assert.equal(result.status, 'skipped_concurrent');
  assert.equal(calls, 0);
  assert.equal(store.finishes.length, 0);
});

test('ejecución idéntica es idempotente y no requiere alerta', async () => {
  const store = new FakeStore();
  const alert = new FakeAlertSender();
  const report = approvedReport({ pricesChanging: 0, pricesUnchanged: 13_483 });
  const runner = new VinrosAutomationRunner({
    store,
    alertSender: alert,
    executeSync: async ({ dryRun, beforeWrite }) => {
      if (dryRun) return report;
      await beforeWrite?.(report);
      return writeResult(report, { pricesUpdated: 0, pricesUnchanged: 13_483 });
    },
  });
  const result = await runner.execute('test');
  assert.equal(result.wrote, true);
  assert.equal(result.pricesUpdated, 0);
  assert.equal(result.alertStatus, 'not_required');
  assert.equal(alert.calls, 0);
});

test('un cambio entre dry-run y write aborta antes de aplicar', async () => {
  const store = new FakeStore();
  const dry = approvedReport();
  const changed = approvedReport();
  changed.lists.retail.contentFingerprint = 'changed-fingerprint';
  const runner = new VinrosAutomationRunner({
    store,
    alertSender: null,
    executeSync: async ({ dryRun, beforeWrite }) => {
      if (dryRun) return dry;
      await beforeWrite?.(changed);
      assert.fail('El write no debe continuar tras cambiar la fuente.');
    },
  });
  const result = await runner.execute('test');
  assert.equal(result.status, 'failed');
  assert.match(result.error ?? '', /SOURCES_CHANGED_AFTER_DRY_RUN/);
});

test('nuevos BLOCKED no aprobados bloquean el auto-write', () => {
  const report = approvedReport();
  report.anomalies.push({
    fingerprint: 'new-blocked',
    type: 'SUPPLIER_PRICE_CHANGE_BLOCKED',
    severity: 'error',
    blocking: true,
    message: 'fixture',
    supplierSku: 'NEW999',
    priceType: 'retail',
    oldPrice: 100,
    observedPrice: 1,
    rawData: {},
  });
  const decision = evaluateSupplierAutomationReport(report);
  assert.equal(decision.canWrite, false);
  assert.deepEqual(decision.newlyBlockedSkus, ['NEW999']);
});

test('alerta Resend usa idempotencia por run y no expone el token en el payload', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const sender = new ResendSupplierAlertSender({
    apiKey: 'server-only-test-key',
    from: 'Runia <alerts@example.com>',
    to: 'operations@example.com',
  }, async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(JSON.stringify({ id: 'email-provider-id' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const result = await sender.send({
    runId: 'automation-run-1',
    status: 'blocked',
    reasons: ['Fuente cost fuera de baseline.'],
    products: 3_916,
    pricesChanged: 0,
    blocked: 6,
    pendingReview: 15,
    supplierOnlyCost: 684,
  });

  assert.equal(result.providerMessageId, 'email-provider-id');
  assert.equal(capturedUrl, 'https://api.resend.com/emails');
  assert.equal(new Headers(capturedInit?.headers).get('idempotency-key'), 'vinros-sync-alert-automation-run-1');
  assert.equal(String(capturedInit?.body).includes('server-only-test-key'), false);
});

test('la identidad del reporte incluye fingerprints y métricas de seguridad', () => {
  const approved = approvedReport();
  const changed = approvedReport();
  assert.equal(supplierReportsMatch(approved, changed), true);
  changed.global.eligibility.pending_review.count = 16;
  assert.equal(supplierReportsMatch(approved, changed), false);
});

test('la migración de automatización aplica RLS, single-flight y permisos server-only', () => {
  const sql = readFileSync(
    'db/migrations/015_vinros_automation.sql',
    'utf8',
  ).toLowerCase();
  for (const contract of [
    'supplier_sync_automation_runs',
    'supplier_sync_automation_runs_one_running_idx',
    'supplier_start_automation_run',
    'supplier_finish_automation_run',
    'skipped_concurrent',
    'pg_advisory_xact_lock',
    'security invoker',
    'enable row level security',
    'revoke all on table public.supplier_sync_automation_runs from anon, authenticated',
    'grant select, insert, update on table public.supplier_sync_automation_runs to service_role',
  ]) {
    assert.equal(sql.includes(contract), true, contract);
  }
  assert.equal(sql.includes('security definer'), false);
});

test('el scheduler diario es no concurrente, acotado y usa sólo secrets', () => {
  const workflow = readFileSync(
    '.github/workflows/vinros-production-sync.yml',
    'utf8',
  );
  for (const contract of [
    "cron: '20 6 * * *'",
    'workflow_dispatch:',
    'group: vinros-production-sync',
    'cancel-in-progress: false',
    'timeout-minutes: 30',
    'permissions:',
    'contents: read',
    'secrets.RUNIA_PRODUCTION_SUPABASE_URL',
    'secrets.RUNIA_PRODUCTION_SUPABASE_SERVICE_ROLE_KEY',
    'npm ci',
    'npm run sync:vinros:production:auto',
  ]) {
    assert.equal(workflow.includes(contract), true, contract);
  }
  assert.equal(workflow.includes('https://docs.google.com/'), false);
  assert.equal(workflow.includes('NEXT_PUBLIC_'), false);
});

function approvedReport(overrides: {
  pricesChanging?: number;
  pricesUnchanged?: number;
} = {}): SupplierDryRunReport {
  return {
    mode: 'dry-run',
    supplierCode: 'vinros',
    generatedAt: '2026-08-25T06:20:00.000Z',
    canWrite: true,
    snapshotAvailable: true,
    snapshotNote: null,
    lists: Object.fromEntries(SUPPLIER_PRICE_TYPES.map((priceType, index) => {
      const rows = VINROS_PRODUCTION_POLICY.approvedListRows[priceType];
      return [priceType, {
        priceType,
        expectedListNumber: index + 1,
        detectedListNumber: index + 1,
        sourceEmissionDate: '2026-08-24',
        sourceHttpLastModified: '2026-08-24T12:00:00.000Z',
        fetchedAt: '2026-08-25T06:20:00.000Z',
        contentFingerprint: `fingerprint-${priceType}`,
        rowsTotal: rows,
        rowsValid: rows,
        rowsInvalid: 0,
        uniqueCodes: rows,
        duplicates: 0,
        validPercent: 100,
        approvedBaselineRows: rows,
        baselinePercent: 100,
        integrityStatus: 'ok',
        warnings: [],
        blockingFailures: [],
      }];
    })) as unknown as SupplierDryRunReport['lists'],
    global: {
      uniqueSkus: 3_916,
      presentIn4: 3_200,
      presentIn3: 20,
      presentIn2: 12,
      presentIn1: 684,
      newProducts: 0,
      existingProducts: 3_916,
      missingProducts: 0,
      pricesUnchanged: overrides.pricesUnchanged ?? 13_483,
      pricesChanging: overrides.pricesChanging ?? 0,
      warnings: 0,
      blockedPrices: 20,
      anomalies: 0,
      inconsistentNames: 0,
      inconsistentPresentations: 0,
      eligibility: {
        safe: { count: 3_211, percent: 82 },
        blocked: { count: 6, percent: 0.15 },
        pending_review: { count: 15, percent: 0.38 },
        supplier_only_cost: { count: 684, percent: 17.47 },
      },
    },
    anomalies: VINROS_PRODUCTION_POLICY.approvedBlockedSkus.map((supplierSku) => ({
      fingerprint: `blocked-${supplierSku}`,
      type: 'SUPPLIER_PRICE_CHANGE_BLOCKED',
      severity: 'error' as const,
      blocking: true,
      message: 'approved fixture',
      supplierSku,
      priceType: 'retail' as const,
      oldPrice: 100,
      observedPrice: 1,
      rawData: {},
    })),
  };
}

function writeResult(
  report: SupplierDryRunReport,
  counts: { pricesUpdated: number; pricesUnchanged: number },
): SupplierSyncResult {
  return {
    mode: 'write',
    runId: 'supplier-sync-run',
    supplierId: 'supplier',
    status: 'completed_with_warnings',
    productsRead: report.global.uniqueSkus,
    productsCreated: 0,
    pricesUpdated: counts.pricesUpdated,
    pricesUnchanged: counts.pricesUnchanged,
    warnings: report.global.warnings,
    errors: 0,
    anomalies: report.global.anomalies,
    report,
  };
}

class FakeStore implements SupplierAutomationRunStore {
  claimed = true;
  finishes: SupplierAutomationRunFinish[] = [];
  alerts: Array<{ status: 'sent' | 'failed' }> = [];

  async start() {
    return {
      claimed: this.claimed,
      runId: 'automation-run',
      supplierId: 'supplier',
      activeRunId: this.claimed ? undefined : 'active-run',
    };
  }

  async finish(input: SupplierAutomationRunFinish) {
    this.finishes.push(input);
  }

  async recordAlert(input: { status: 'sent' | 'failed' }) {
    this.alerts.push(input);
  }
}

class FakeAlertSender implements SupplierAutomationAlertSender {
  calls = 0;
  async send() {
    this.calls += 1;
    return { providerMessageId: 'email-1' };
  }
}
