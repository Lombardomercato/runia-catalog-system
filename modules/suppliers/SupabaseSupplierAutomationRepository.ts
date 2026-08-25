import 'server-only';

export type SupplierAutomationTrigger = 'schedule' | 'manual' | 'test';
export type SupplierAutomationFinalStatus =
  | 'completed'
  | 'completed_with_warnings'
  | 'blocked'
  | 'failed';

export type SupplierAutomationRunClaim = {
  claimed: boolean;
  runId: string;
  supplierId: string;
  activeRunId?: string;
};

export type SupplierAutomationRunFinish = {
  runId: string;
  status: SupplierAutomationFinalStatus;
  dryRunResult: Record<string, unknown> | null;
  writeResult: Record<string, unknown> | null;
  products: number;
  pricesChanged: number;
  blocked: number;
  pendingReview: number;
  supplierOnlyCost: number;
  warnings: number;
  errors: number;
  errorSummary: string | null;
  alertStatus: 'pending' | 'not_required';
};

export interface SupplierAutomationRunStore {
  start(input: {
    tenantSlug: string;
    supplierCode: string;
    triggerSource: SupplierAutomationTrigger;
    leaseSeconds: number;
  }): Promise<SupplierAutomationRunClaim>;
  finish(input: SupplierAutomationRunFinish): Promise<void>;
  recordAlert(input: {
    runId: string;
    status: 'sent' | 'failed';
    providerMessageId?: string | null;
    errorSummary?: string | null;
  }): Promise<void>;
}

export class SupabaseSupplierAutomationRunStore implements SupplierAutomationRunStore {
  async start(input: {
    tenantSlug: string;
    supplierCode: string;
    triggerSource: SupplierAutomationTrigger;
    leaseSeconds: number;
  }) {
    const { supabaseServer } = await import('@/lib/supabaseServer');
    const { data, error } = await supabaseServer.rpc('supplier_start_automation_run', {
      p_tenant_slug: input.tenantSlug,
      p_supplier_code: input.supplierCode,
      p_trigger_source: input.triggerSource,
      p_lease_seconds: input.leaseSeconds,
    });
    if (error) throw new Error(error.message);
    const result = data as Record<string, unknown>;
    return {
      claimed: result.claimed === true,
      runId: String(result.runId),
      supplierId: String(result.supplierId),
      activeRunId: result.activeRunId ? String(result.activeRunId) : undefined,
    };
  }

  async finish(input: SupplierAutomationRunFinish) {
    const { supabaseServer } = await import('@/lib/supabaseServer');
    const { error } = await supabaseServer.rpc('supplier_finish_automation_run', {
      p_run_id: input.runId,
      p_status: input.status,
      p_dry_run_result: input.dryRunResult,
      p_write_result: input.writeResult,
      p_products: input.products,
      p_prices_changed: input.pricesChanged,
      p_blocked: input.blocked,
      p_pending_review: input.pendingReview,
      p_supplier_only_cost: input.supplierOnlyCost,
      p_warnings: input.warnings,
      p_errors: input.errors,
      p_error_summary: input.errorSummary,
      p_alert_status: input.alertStatus,
    });
    if (error) throw new Error(error.message);
  }

  async recordAlert(input: {
    runId: string;
    status: 'sent' | 'failed';
    providerMessageId?: string | null;
    errorSummary?: string | null;
  }) {
    const { supabaseServer } = await import('@/lib/supabaseServer');
    const { error } = await supabaseServer
      .from('supplier_sync_automation_runs')
      .update({
        alert_status: input.status,
        alert_sent_at: input.status === 'sent' ? new Date().toISOString() : null,
        alert_provider_message_id: input.providerMessageId ?? null,
        alert_error_summary: safeSummary(input.errorSummary),
      })
      .eq('id', input.runId)
      .in('alert_status', ['pending', 'failed']);
    if (error) throw new Error(error.message);
  }
}

function safeSummary(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/\s+/g, ' ').trim().slice(0, 500);
}
