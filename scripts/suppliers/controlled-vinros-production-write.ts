import 'dotenv/config';

import { supplierReportsMatch } from '../../core/suppliers/automation';
import {
  SUPPLIER_PRICE_TYPES,
  type SupplierDryRunReport,
  type SupplierPriceType,
  type SupplierSyncPlan,
  type SupplierSyncResult,
} from '../../core/suppliers/types';
import { supabaseServer } from '../../lib/supabaseServer';
import { SupabaseSupplierSnapshotReader } from '../../modules/suppliers/SupabaseSupplierSyncRepository';
import { syncVinrosPrices } from '../../modules/suppliers/vinros';

const PROJECT_REF = 'ymowgnjusqzkqjpwokib';
const TENANT_SLUG = 'lombardo';
const SUPPLIER_CODE = 'vinros';
const CONFIRMATION = 'WRITE_APPROVED_VINROS_3928_TO_RUNIA_PRODUCTION';
const EXPECTED_LIST_ROWS: Record<SupplierPriceType, number> = {
  retail: 3_233,
  wholesale: 3_230,
  business: 3_231,
  cost: 3_875,
};
const EXPECTED_ELIGIBILITY = {
  safe: 3_213,
  blocked: 7,
  pending_review: 15,
  supplier_only_cost: 693,
} as const;
const EXPECTED_CH111B_PRICES: Record<SupplierPriceType, number> = {
  retail: 6_091,
  wholesale: 5_661.95,
  business: 4_853.05,
  cost: 6_643.55,
};
const EXPECTED_PROMOTED_PRICES = 13_488;

async function main() {
  validateEnvironment();

  const preWriteDryRun = await executeDryRun();
  validateReport(preWriteDryRun, {
    phase: 'DRY_RUN_PRE_WRITE',
    expectedNewProducts: 12,
    expectedMissingProducts: 0,
    expectedPricesChanging: 425,
    expectedPricesUnchanged: 13_063,
  });

  const write1 = asWriteResult(await syncVinrosPrices({
    dryRun: false,
    tenantSlug: TENANT_SLUG,
    baselines: EXPECTED_LIST_ROWS,
    beforeWrite: (plan) => {
      validatePlan(plan, 'WRITE_1_RECHECK');
      if (!supplierReportsMatch(preWriteDryRun, plan.report)) {
        throw new Error('WRITE_1_SOURCES_CHANGED_AFTER_DRY_RUN');
      }
    },
  }));
  assertEqual(write1.productsCreated, 12, 'WRITE_1_PRODUCTS_CREATED');
  assertEqual(write1.pricesUpdated, 425, 'WRITE_1_PRICES_UPDATED');
  assertEqual(write1.pricesUnchanged, 13_063, 'WRITE_1_PRICES_UNCHANGED');
  const audit1 = await auditProduction(write1.runId);
  validateProductionAudit(audit1, 'WRITE_1_AUDIT');

  const secondDryRun = await executeDryRun();
  validateReport(secondDryRun, {
    phase: 'WRITE_2_DRY_RUN',
    expectedNewProducts: 0,
    expectedMissingProducts: 0,
    expectedPricesChanging: 0,
    expectedPricesUnchanged: EXPECTED_PROMOTED_PRICES,
  });

  const write2 = asWriteResult(await syncVinrosPrices({
    dryRun: false,
    tenantSlug: TENANT_SLUG,
    baselines: EXPECTED_LIST_ROWS,
    beforeWrite: (plan) => {
      validatePlan(plan, 'WRITE_2_RECHECK');
      if (!supplierReportsMatch(secondDryRun, plan.report)) {
        throw new Error('WRITE_2_SOURCES_CHANGED_AFTER_DRY_RUN');
      }
      assertEqual(plan.report.global.newProducts, 0, 'WRITE_2_RECHECK_NEW_PRODUCTS');
      assertEqual(plan.report.global.pricesChanging, 0, 'WRITE_2_RECHECK_PRICES_CHANGING');
    },
  }));
  assertEqual(write2.productsCreated, 0, 'WRITE_2_PRODUCTS_CREATED');
  assertEqual(write2.pricesUpdated, 0, 'WRITE_2_PRICES_UPDATED');
  assertEqual(write2.pricesUnchanged, EXPECTED_PROMOTED_PRICES, 'WRITE_2_PRICES_UNCHANGED');
  const audit2 = await auditProduction(write2.runId);
  validateProductionAudit(audit2, 'WRITE_2_AUDIT');
  assertEqual(audit2.historyForRun, 0, 'WRITE_2_HISTORY');

  console.log(JSON.stringify({
    controlledWrite: 'PASS',
    dryRunPreWrite: reportSummary(preWriteDryRun),
    write1: resultSummary(write1, audit1),
    write2: resultSummary(write2, audit2),
  }));
}

async function executeDryRun() {
  const result = await syncVinrosPrices({
    dryRun: true,
    tenantSlug: TENANT_SLUG,
    baselines: EXPECTED_LIST_ROWS,
  });
  if (result.mode !== 'dry-run') throw new Error('EXPECTED_DRY_RUN');
  return result;
}

function validateEnvironment() {
  if (process.env.VINROS_CONTROLLED_WRITE_CONFIRM !== CONFIRMATION) {
    throw new Error('VINROS_CONTROLLED_WRITE_NOT_CONFIRMED');
  }
  const url = new URL(requiredEnvironment('SUPABASE_URL'));
  if (url.origin !== `https://${PROJECT_REF}.supabase.co`) {
    throw new Error('VINROS_CONTROLLED_WRITE_WRONG_SUPABASE_PROJECT');
  }
  requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  if (requiredEnvironment('VINROS_TENANT_SLUG') !== TENANT_SLUG) {
    throw new Error('VINROS_CONTROLLED_WRITE_WRONG_TENANT');
  }
}

function validateReport(report: SupplierDryRunReport, expected: {
  phase: string;
  expectedNewProducts: number;
  expectedMissingProducts: number;
  expectedPricesChanging: number;
  expectedPricesUnchanged: number;
}) {
  if (!report.canWrite || !report.snapshotAvailable) {
    throw new Error(`${expected.phase}_NOT_WRITABLE`);
  }
  assertEqual(report.global.uniqueSkus, 3_928, `${expected.phase}_TOTAL`);
  assertEqual(report.global.newProducts, expected.expectedNewProducts, `${expected.phase}_NEW_PRODUCTS`);
  assertEqual(report.global.missingProducts, expected.expectedMissingProducts, `${expected.phase}_MISSING_PRODUCTS`);
  assertEqual(report.global.pricesChanging, expected.expectedPricesChanging, `${expected.phase}_PRICES_CHANGING`);
  assertEqual(report.global.pricesUnchanged, expected.expectedPricesUnchanged, `${expected.phase}_PRICES_UNCHANGED`);
  for (const priceType of SUPPLIER_PRICE_TYPES) {
    const list = report.lists[priceType];
    assertEqual(list.rowsValid, EXPECTED_LIST_ROWS[priceType], `${expected.phase}_${priceType.toUpperCase()}_ROWS`);
    assertEqual(list.rowsInvalid, 0, `${expected.phase}_${priceType.toUpperCase()}_INVALID`);
    assertEqual(list.duplicates, 0, `${expected.phase}_${priceType.toUpperCase()}_DUPLICATES`);
    if (!list.contentFingerprint) throw new Error(`${expected.phase}_${priceType.toUpperCase()}_FINGERPRINT_MISSING`);
  }
  for (const [status, count] of Object.entries(EXPECTED_ELIGIBILITY)) {
    assertEqual(
      report.global.eligibility[status as keyof typeof EXPECTED_ELIGIBILITY].count,
      count,
      `${expected.phase}_${status.toUpperCase()}`,
    );
  }
  const blockedSkus = new Set(report.anomalies
    .filter((item) => item.blocking && item.supplierSku)
    .map((item) => item.supplierSku));
  if (!blockedSkus.has('CH111B')) throw new Error(`${expected.phase}_CH111B_NOT_BLOCKED`);
}

function validatePlan(plan: SupplierSyncPlan, phase: string) {
  validateReport(plan.report, {
    phase,
    expectedNewProducts: plan.report.global.newProducts ?? -1,
    expectedMissingProducts: plan.report.global.missingProducts ?? -1,
    expectedPricesChanging: plan.report.global.pricesChanging ?? -1,
    expectedPricesUnchanged: plan.report.global.pricesUnchanged ?? -1,
  });
  const product = plan.products.find((item) => item.supplierSku === 'CH111B');
  if (!product || product.eligibilityStatus !== 'blocked') {
    throw new Error(`${phase}_CH111B_STATUS`);
  }
  assertEqual(product.prices.length, 0, `${phase}_CH111B_CURRENT_PLAN`);
  assertEqual(product.candidatePrices.length, 4, `${phase}_CH111B_CANDIDATES`);
  for (const priceType of SUPPLIER_PRICE_TYPES) {
    const candidate = product.candidatePrices.find((item) => item.priceType === priceType);
    if (!candidate) throw new Error(`${phase}_CH111B_${priceType.toUpperCase()}_MISSING`);
    assertMoney(candidate.observedPrice, EXPECTED_CH111B_PRICES[priceType], `${phase}_CH111B_${priceType.toUpperCase()}`);
  }
}

async function auditProduction(syncRunId: string) {
  const snapshot = await new SupabaseSupplierSnapshotReader().loadSnapshot({
    tenantSlug: TENANT_SLUG,
    supplierCode: SUPPLIER_CODE,
  });
  if (!snapshot.available) throw new Error('PRODUCTION_SNAPSHOT_UNAVAILABLE');
  const eligibility = Object.fromEntries(Object.keys(EXPECTED_ELIGIBILITY).map((status) => [
    status,
    snapshot.products.filter((product) => product.eligibilityStatus === status).length,
  ]));
  const duplicates = snapshot.products.length - new Set(snapshot.products.map((product) => product.supplierSku)).size;
  const ch = snapshot.products.find((product) => product.supplierSku === 'CH111B');
  if (!ch) throw new Error('PRODUCTION_CH111B_MISSING');

  const { data: tenant, error: tenantError } = await supabaseServer
    .from('tenants').select('id').eq('slug', TENANT_SLUG).single();
  if (tenantError) throw new Error(tenantError.message);
  const { data: supplier, error: supplierError } = await supabaseServer
    .from('suppliers').select('id').eq('tenant_id', tenant.id).eq('code', SUPPLIER_CODE).single();
  if (supplierError) throw new Error(supplierError.message);
  const { data: chRow, error: chError } = await supabaseServer
    .from('supplier_products')
    .select('source_raw')
    .eq('supplier_id', supplier.id)
    .eq('supplier_sku', 'CH111B')
    .single();
  if (chError) throw new Error(chError.message);
  const { count: historyForRun, error: historyError } = await supabaseServer
    .from('supplier_price_history')
    .select('id', { count: 'exact', head: true })
    .eq('sync_run_id', syncRunId);
  if (historyError) throw new Error(historyError.message);
  const candidatePrices = (chRow.source_raw as Record<string, unknown> | null)?.candidatePrices;
  return {
    total: snapshot.products.length,
    eligibility,
    duplicates,
    chEligibility: ch.eligibilityStatus,
    chCurrentPrices: Object.keys(ch.prices).length,
    chCandidatePrices: Array.isArray(candidatePrices) ? candidatePrices.length : 0,
    historyForRun: historyForRun ?? -1,
  };
}

function validateProductionAudit(audit: Awaited<ReturnType<typeof auditProduction>>, phase: string) {
  assertEqual(audit.total, 3_928, `${phase}_TOTAL`);
  assertEqual(audit.duplicates, 0, `${phase}_DUPLICATES`);
  for (const [status, count] of Object.entries(EXPECTED_ELIGIBILITY)) {
    assertEqual(audit.eligibility[status], count, `${phase}_${status.toUpperCase()}`);
  }
  if (audit.chEligibility !== 'blocked') throw new Error(`${phase}_CH111B_STATUS`);
  assertEqual(audit.chCurrentPrices, 0, `${phase}_CH111B_CURRENT_PRICES`);
  assertEqual(audit.chCandidatePrices, 4, `${phase}_CH111B_CANDIDATES`);
}

function reportSummary(report: SupplierDryRunReport) {
  return {
    total: report.global.uniqueSkus,
    eligibility: Object.fromEntries(Object.entries(report.global.eligibility).map(([status, value]) => [status, value.count])),
    lists: Object.fromEntries(SUPPLIER_PRICE_TYPES.map((priceType) => [priceType, report.lists[priceType].rowsValid])),
    fingerprints: Object.fromEntries(SUPPLIER_PRICE_TYPES.map((priceType) => [priceType, report.lists[priceType].contentFingerprint])),
    pricesChanging: report.global.pricesChanging,
    pricesUnchanged: report.global.pricesUnchanged,
  };
}

function resultSummary(result: SupplierSyncResult, audit: Awaited<ReturnType<typeof auditProduction>>) {
  return {
    runId: result.runId,
    productsCreated: result.productsCreated,
    pricesUpdated: result.pricesUpdated,
    pricesUnchanged: result.pricesUnchanged,
    historyForRun: audit.historyForRun,
    duplicates: audit.duplicates,
    chCurrentPrices: audit.chCurrentPrices,
  };
}

function asWriteResult(value: SupplierDryRunReport | SupplierSyncResult) {
  if (value.mode !== 'write') throw new Error('EXPECTED_WRITE_RESULT');
  return value;
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_SERVER_ONLY_${name}`);
  return value;
}

function assertEqual(actual: unknown, expected: unknown, code: string) {
  if (actual !== expected) throw new Error(`${code}:EXPECTED_${expected}:ACTUAL_${actual}`);
}

function assertMoney(actual: number, expected: number, code: string) {
  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${code}:EXPECTED_${expected}:ACTUAL_${actual}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'VINROS_CONTROLLED_WRITE_UNKNOWN_ERROR');
  process.exitCode = 1;
});
