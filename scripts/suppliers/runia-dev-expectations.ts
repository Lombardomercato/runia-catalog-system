import type { SupplierDryRunReport, SupplierPriceType } from '../../core/suppliers/types';

export type RuniaDevSnapshotExpectation = 'empty' | 'idempotent';

export const RUNIA_DEV_APPROVED_LIST_COUNTS: Record<SupplierPriceType, number> = {
  retail: 3_284,
  wholesale: 3_281,
  business: 3_279,
  cost: 3_875,
};
export const RUNIA_DEV_APPROVED_ELIGIBILITY = {
  safe: 3_265,
  blocked: 5,
  pending_review: 16,
  supplier_only_cost: 611,
} as const;
export const RUNIA_DEV_APPROVED_TOTAL = 3_897;

export function runiaDevReportDifferences(
  report: SupplierDryRunReport,
  expectation: RuniaDevSnapshotExpectation,
) {
  const differences: string[] = [];
  if (!report.canWrite) differences.push('las fuentes/guardrails no permiten write');
  if (!report.snapshotAvailable) differences.push('snapshot de Runia Dev no disponible');
  if (report.global.uniqueSkus !== RUNIA_DEV_APPROVED_TOTAL) {
    differences.push(`SKUs ${report.global.uniqueSkus} != ${RUNIA_DEV_APPROVED_TOTAL}`);
  }
  for (const [priceType, expected] of Object.entries(RUNIA_DEV_APPROVED_LIST_COUNTS) as Array<[SupplierPriceType, number]>) {
    const list = report.lists[priceType];
    if (list.rowsValid !== expected) differences.push(`${priceType}.validas ${list.rowsValid} != ${expected}`);
    if (list.rowsInvalid !== 0) differences.push(`${priceType}.invalidas ${list.rowsInvalid} != 0`);
    if (list.duplicates !== 0) differences.push(`${priceType}.duplicados ${list.duplicates} != 0`);
  }
  for (const [status, expected] of Object.entries(RUNIA_DEV_APPROVED_ELIGIBILITY) as Array<[keyof typeof RUNIA_DEV_APPROVED_ELIGIBILITY, number]>) {
    const actual = report.global.eligibility[status].count;
    if (actual !== expected) differences.push(`${status} ${actual} != ${expected}`);
  }

  if (expectation === 'empty') {
    if (report.global.newProducts !== RUNIA_DEV_APPROVED_TOTAL) differences.push(`nuevos ${report.global.newProducts} != ${RUNIA_DEV_APPROVED_TOTAL}`);
    if (report.global.existingProducts !== 0) differences.push(`existentes ${report.global.existingProducts} != 0`);
    if (report.global.missingProducts !== 0) differences.push(`faltantes ${report.global.missingProducts} != 0`);
  } else {
    if (report.global.newProducts !== 0) differences.push(`nuevos ${report.global.newProducts} != 0`);
    if (report.global.existingProducts !== RUNIA_DEV_APPROVED_TOTAL) differences.push(`existentes ${report.global.existingProducts} != ${RUNIA_DEV_APPROVED_TOTAL}`);
    if (report.global.missingProducts !== 0) differences.push(`faltantes ${report.global.missingProducts} != 0`);
    if (report.global.pricesChanging !== 0) differences.push(`precios que cambiarian ${report.global.pricesChanging} != 0`);
  }
  return differences;
}

export function assertRuniaDevApprovedReport(
  report: SupplierDryRunReport,
  expectation: RuniaDevSnapshotExpectation,
) {
  const differences = runiaDevReportDifferences(report, expectation);
  if (differences.length > 0) {
    throw new Error(`RUNIA_DEV_APPROVED_DRY_MISMATCH:\n- ${differences.join('\n- ')}`);
  }
}
