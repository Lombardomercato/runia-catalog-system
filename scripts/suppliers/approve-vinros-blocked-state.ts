import 'dotenv/config';

import {
  supplierBlockedStateReview,
  VINROS_PRODUCTION_POLICY,
} from '../../core/suppliers/automation';
import { SUPPLIER_PRICE_TYPES } from '../../core/suppliers/types';
import { supabaseServer } from '../../lib/supabaseServer';
import { SupabaseSupplierAutomationRunStore } from '../../modules/suppliers/SupabaseSupplierAutomationRepository';
import { syncVinrosPrices } from '../../modules/suppliers/vinros';

const PROJECT_REF = 'ymowgnjusqzkqjpwokib';
const TENANT_SLUG = 'lombardo';
const SUPPLIER_CODE = 'vinros';
const REVIEWED_SKU = 'CH111B';
const CONFIRMATION = 'APPROVE_CH111B_EXACT_BLOCKED_STATE';
const EXPECTED_PRICES = {
  retail: 6_091,
  wholesale: 5_661.95,
  business: 4_853.05,
  cost: 6_643.55,
} as const;

async function main() {
  validateEnvironment();
  const result = await syncVinrosPrices({
    dryRun: true,
    tenantSlug: TENANT_SLUG,
    baselines: VINROS_PRODUCTION_POLICY.approvedListRows,
  });
  if (result.mode !== 'dry-run' || !result.snapshotAvailable || !result.canWrite) {
    throw new Error('CH111B_REVIEW_DRY_RUN_NOT_WRITABLE');
  }
  assertEqual(result.global.uniqueSkus, 3_928, 'TOTAL');
  for (const priceType of SUPPLIER_PRICE_TYPES) {
    assertEqual(
      result.lists[priceType].rowsValid,
      VINROS_PRODUCTION_POLICY.approvedListRows[priceType],
      `${priceType.toUpperCase()}_ROWS`,
    );
  }
  for (const [status, expected] of Object.entries(VINROS_PRODUCTION_POLICY.approvedEligibility)) {
    assertEqual(
      result.global.eligibility[status as keyof typeof VINROS_PRODUCTION_POLICY.approvedEligibility].count,
      expected,
      status.toUpperCase(),
    );
  }

  const review = supplierBlockedStateReview(result, REVIEWED_SKU);
  if (!review) throw new Error('CH111B_BLOCKED_STATE_MISSING');
  const anomaly = result.anomalies.find((item) => (
    item.blocking
    && item.supplierSku === REVIEWED_SKU
    && item.type === 'CROSS_LIST_COST_ABOVE_RETAIL'
  ));
  if (!anomaly) throw new Error('CH111B_EXPECTED_GUARDRAIL_MISSING');
  const observedPrices = anomaly.rawData.observedPrices as Record<string, unknown> | undefined;
  for (const priceType of SUPPLIER_PRICE_TYPES) {
    assertMoney(observedPrices?.[priceType], EXPECTED_PRICES[priceType], `CH111B_${priceType}`);
  }

  const store = new SupabaseSupplierAutomationRunStore();
  const { data: tenant, error: tenantError } = await supabaseServer
    .from('tenants').select('id').eq('slug', TENANT_SLUG).single();
  if (tenantError) throw new Error(tenantError.message);
  const { data: supplier, error: supplierError } = await supabaseServer
    .from('suppliers').select('id').eq('tenant_id', tenant.id).eq('code', SUPPLIER_CODE).single();
  if (supplierError) throw new Error(supplierError.message);
  await store.saveReviewedBlockedState({
    supplierId: supplier.id,
    review,
    reviewedBy: 'controlled-human-approval-2026-08-27',
  });

  console.log(JSON.stringify({
    reviewedBlockedState: 'STORED',
    supplierSku: REVIEWED_SKU,
    signaturePrefix: review.stateSignature.slice(0, 12),
  }));
}

function validateEnvironment() {
  if (process.env.VINROS_BLOCKED_REVIEW_CONFIRM !== CONFIRMATION) {
    throw new Error('CH111B_REVIEW_NOT_CONFIRMED');
  }
  const url = new URL(requiredEnvironment('SUPABASE_URL'));
  if (url.origin !== `https://${PROJECT_REF}.supabase.co`) {
    throw new Error('CH111B_REVIEW_WRONG_SUPABASE_PROJECT');
  }
  requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  if (requiredEnvironment('VINROS_TENANT_SLUG') !== TENANT_SLUG) {
    throw new Error('CH111B_REVIEW_WRONG_TENANT');
  }
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_SERVER_ONLY_${name}`);
  return value;
}

function assertEqual(actual: unknown, expected: unknown, code: string) {
  if (actual !== expected) throw new Error(`${code}:EXPECTED_${expected}:ACTUAL_${actual}`);
}

function assertMoney(actual: unknown, expected: number, code: string) {
  if (typeof actual !== 'number' || Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${code}:EXPECTED_${expected}:ACTUAL_${String(actual)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'CH111B_REVIEW_UNKNOWN_ERROR');
  process.exitCode = 1;
});
