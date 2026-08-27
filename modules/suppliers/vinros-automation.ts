import 'server-only';

import {
  evaluateSupplierAutomationReport,
  supplierReportsMatch,
  summarizeSupplierDryRun,
  VINROS_PRODUCTION_POLICY,
  type SupplierAutomationDecision,
} from '@/core/suppliers/automation';
import type {
  SupplierDryRunReport,
  SupplierSyncResult,
} from '@/core/suppliers/types';
import {
  createSupplierAutomationAlertSenderFromEnvironment,
  type SupplierAutomationAlertSender,
} from './ResendSupplierAlertSender';
import {
  SupabaseSupplierAutomationRunStore,
  type SupplierAutomationRunStore,
  type SupplierAutomationTrigger,
} from './SupabaseSupplierAutomationRepository';
import { syncVinrosPrices } from './vinros';

const RUNIA_PRODUCTION_PROJECT_REF = 'ymowgnjusqzkqjpwokib';
const VINROS_TENANT_SLUG = 'lombardo';
const VINROS_SUPPLIER_CODE = 'vinros';

export type SupplierAutomationSyncExecutor = (input: {
  dryRun: boolean;
  beforeWrite?: (report: SupplierDryRunReport) => void | Promise<void>;
}) => Promise<SupplierDryRunReport | SupplierSyncResult>;

export class VinrosAutomationRunner {
  constructor(
    private readonly dependencies: {
      store: SupplierAutomationRunStore;
      executeSync: SupplierAutomationSyncExecutor;
      alertSender: SupplierAutomationAlertSender | null;
      leaseSeconds?: number;
    },
  ) {}

  async execute(triggerSource: SupplierAutomationTrigger) {
    const claim = await this.dependencies.store.start({
      tenantSlug: VINROS_TENANT_SLUG,
      supplierCode: VINROS_SUPPLIER_CODE,
      triggerSource,
      leaseSeconds: this.dependencies.leaseSeconds ?? 1_800,
    });
    if (!claim.claimed) {
      return {
        runId: claim.runId,
        status: 'skipped_concurrent' as const,
        wrote: false,
        alertStatus: 'not_required' as const,
      };
    }

    let dryRun: SupplierDryRunReport | null = null;
    let decision: SupplierAutomationDecision | null = null;
    try {
      const dryResult = await this.dependencies.executeSync({ dryRun: true });
      if (dryResult.mode !== 'dry-run') throw new Error('VINROS_AUTOMATION_EXPECTED_DRY_RUN');
      dryRun = dryResult;
      const reviewedBlockedStates = await this.dependencies.store.loadReviewedBlockedStates(
        claim.supplierId,
      );
      decision = evaluateSupplierAutomationReport(
        dryRun,
        VINROS_PRODUCTION_POLICY,
        reviewedBlockedStates,
      );

      if (!decision.canWrite) {
        const alertRequired = decision.alertReasons.length > 0;
        await this.dependencies.store.finish({
          ...runMetrics(claim.runId, dryRun),
          status: 'blocked',
          dryRunResult: summarizeSupplierDryRun(dryRun, decision),
          writeResult: null,
          errors: Math.max(1, decision.blockingReasons.length),
          errorSummary: decision.blockingReasons.join(' | '),
          alertStatus: alertRequired && this.dependencies.alertSender ? 'pending' : 'not_required',
        });
        const alertStatus = await this.sendAlertIfRequired(
          claim.runId,
          'blocked',
          dryRun,
          decision.alertReasons,
        );
        return { runId: claim.runId, status: 'blocked' as const, wrote: false, alertStatus };
      }

      const writeResult = await this.dependencies.executeSync({
        dryRun: false,
        beforeWrite: (candidate) => {
          const candidateDecision = evaluateSupplierAutomationReport(
            candidate,
            VINROS_PRODUCTION_POLICY,
            reviewedBlockedStates,
          );
          if (!candidateDecision.canWrite) {
            throw new Error('VINROS_AUTOMATION_WRITE_RECHECK_BLOCKED');
          }
          if (!supplierReportsMatch(dryRun!, candidate)) {
            throw new Error('VINROS_AUTOMATION_SOURCES_CHANGED_AFTER_DRY_RUN');
          }
        },
      });
      if (writeResult.mode !== 'write') throw new Error('VINROS_AUTOMATION_EXPECTED_WRITE');

      const alertRequired = decision.alertReasons.length > 0;
      await this.dependencies.store.finish({
        ...runMetrics(claim.runId, dryRun),
        status: writeResult.status,
        dryRunResult: summarizeSupplierDryRun(dryRun, decision),
        writeResult: {
          supplierSyncRunId: writeResult.runId,
          status: writeResult.status,
          productsRead: writeResult.productsRead,
          productsCreated: writeResult.productsCreated,
          pricesUpdated: writeResult.pricesUpdated,
          pricesUnchanged: writeResult.pricesUnchanged,
          warnings: writeResult.warnings,
          errors: writeResult.errors,
          anomalies: writeResult.anomalies,
        },
        errors: writeResult.errors,
        errorSummary: null,
        alertStatus: alertRequired && this.dependencies.alertSender ? 'pending' : 'not_required',
      });
      const alertStatus = await this.sendAlertIfRequired(
        claim.runId,
        writeResult.status,
        dryRun,
        decision.alertReasons,
      );
      return {
        runId: claim.runId,
        supplierSyncRunId: writeResult.runId,
        status: writeResult.status,
        wrote: true,
        alertStatus,
        products: writeResult.productsRead,
        productsCreated: writeResult.productsCreated,
        pricesUpdated: writeResult.pricesUpdated,
        pricesUnchanged: writeResult.pricesUnchanged,
      };
    } catch (error) {
      const summary = safeErrorSummary(error);
      const fallbackDecision = decision ?? {
        canWrite: false,
        blockingReasons: [summary],
        alertReasons: [summary],
        priceChangesPercent: 0,
        populationDeltaPercent: 0,
        newlyBlockedSkus: [],
        changedReviewedBlockedSkus: [],
        matchedReviewedBlockedSkus: [],
      };
      await this.dependencies.store.finish({
        ...runMetrics(claim.runId, dryRun),
        status: 'failed',
        dryRunResult: dryRun ? summarizeSupplierDryRun(dryRun, fallbackDecision) : null,
        writeResult: null,
        errors: 1,
        errorSummary: summary,
        alertStatus: this.dependencies.alertSender ? 'pending' : 'not_required',
      });
      const alertStatus = await this.sendAlertIfRequired(
        claim.runId,
        'failed',
        dryRun,
        [summary],
      );
      return {
        runId: claim.runId,
        status: 'failed' as const,
        wrote: false,
        alertStatus,
        error: summary,
      };
    }
  }

  private async sendAlertIfRequired(
    runId: string,
    status: string,
    report: SupplierDryRunReport | null,
    reasons: string[],
  ) {
    if (!this.dependencies.alertSender || reasons.length === 0) return 'not_required' as const;
    try {
      const result = await this.dependencies.alertSender.send({
        runId,
        status,
        reasons,
        products: report?.global.uniqueSkus ?? 0,
        pricesChanged: report?.global.pricesChanging ?? 0,
        blocked: report?.global.eligibility.blocked.count ?? 0,
        pendingReview: report?.global.eligibility.pending_review.count ?? 0,
        supplierOnlyCost: report?.global.eligibility.supplier_only_cost.count ?? 0,
      });
      await this.dependencies.store.recordAlert({
        runId,
        status: 'sent',
        providerMessageId: result.providerMessageId,
      });
      return 'sent' as const;
    } catch (error) {
      await this.dependencies.store.recordAlert({
        runId,
        status: 'failed',
        errorSummary: safeErrorSummary(error),
      }).catch(() => undefined);
      return 'failed' as const;
    }
  }
}

export function createVinrosAutomationRunner() {
  validateProductionEnvironment();
  return new VinrosAutomationRunner({
    store: new SupabaseSupplierAutomationRunStore(),
    alertSender: createSupplierAutomationAlertSenderFromEnvironment(),
    leaseSeconds: positiveIntegerEnvironment('VINROS_RUN_LEASE_SECONDS') ?? 1_800,
    executeSync: async ({ dryRun, beforeWrite }) => syncVinrosPrices({
      dryRun,
      tenantSlug: VINROS_TENANT_SLUG,
      baselines: VINROS_PRODUCTION_POLICY.approvedListRows,
      beforeWrite: beforeWrite
        ? (plan) => beforeWrite(plan.report)
        : undefined,
    }),
  });
}

function validateProductionEnvironment() {
  if (process.env.VINROS_AUTOMATION_ENABLED?.trim().toLowerCase() !== 'true') {
    throw new Error('VINROS_AUTOMATION_DISABLED');
  }
  const url = new URL(requiredEnvironment('SUPABASE_URL'));
  if (url.origin !== `https://${RUNIA_PRODUCTION_PROJECT_REF}.supabase.co`) {
    throw new Error('VINROS_AUTOMATION_WRONG_SUPABASE_PROJECT');
  }
  requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const tenant = requiredEnvironment('VINROS_TENANT_SLUG');
  if (tenant !== VINROS_TENANT_SLUG) throw new Error('VINROS_AUTOMATION_WRONG_TENANT');
}

function runMetrics(runId: string, report: SupplierDryRunReport | null) {
  return {
    runId,
    products: report?.global.uniqueSkus ?? 0,
    pricesChanged: report?.global.pricesChanging ?? 0,
    blocked: report?.global.eligibility.blocked.count ?? 0,
    pendingReview: report?.global.eligibility.pending_review.count ?? 0,
    supplierOnlyCost: report?.global.eligibility.supplier_only_cost.count ?? 0,
    warnings: report?.global.warnings ?? 0,
  };
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable server-only ${name}.`);
  return value;
}

function positiveIntegerEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} debe ser un entero positivo.`);
  return parsed;
}

function safeErrorSummary(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(sb_(?:secret|publishable)_[A-Za-z0-9_-]+)/g, '[REDACTED]')
    .replace(/(re_[A-Za-z0-9_-]+)/g, '[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_000);
}
