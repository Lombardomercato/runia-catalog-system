import { SUPPLIER_PRICE_TYPES, type SupplierDryRunReport } from './types';

export function formatSupplierDryRunReport(report: SupplierDryRunReport) {
  const lines = [
    `VINROS PRICE SYNC — DRY-RUN READ-ONLY`,
    `Generado: ${report.generatedAt}`,
    `Snapshot: ${report.snapshotAvailable ? 'disponible' : `no disponible (${report.snapshotNote})`}`,
    '',
  ];
  for (const type of SUPPLIER_PRICE_TYPES) {
    const list = report.lists[type];
    lines.push(
      `[${type}] Lista esperada ${list.expectedListNumber} / detectada ${list.detectedListNumber ?? 'N/D'} — ${list.integrityStatus.toUpperCase()}`,
      `  emision=${list.sourceEmissionDate ?? 'N/D'} http=${list.sourceHttpLastModified ?? 'N/D'} fetched_at=${list.fetchedAt}`,
      `  filas=${list.rowsTotal} validas=${list.rowsValid} invalidas=${list.rowsInvalid} codigos=${list.uniqueCodes} duplicados=${list.duplicates} valido=${list.validPercent}%`,
      `  baseline=${list.approvedBaselineRows ?? 'NO APROBADO'} proporcion=${list.baselinePercent === null ? 'N/D' : `${list.baselinePercent}%`}`,
    );
    for (const warning of list.warnings) lines.push(`  WARNING: ${warning}`);
    for (const failure of list.blockingFailures) lines.push(`  BLOCKING: ${failure}`);
  }
  const value = (item: number | null) => item === null ? 'N/D' : String(item);
  lines.push(
    '',
    '[global]',
    `  SKUs=${report.global.uniqueSkus} cobertura 4/4=${report.global.presentIn4} 3/4=${report.global.presentIn3} 2/4=${report.global.presentIn2} 1/4=${report.global.presentIn1}`,
    `  nuevos=${value(report.global.newProducts)} existentes=${value(report.global.existingProducts)} faltantes=${value(report.global.missingProducts)}`,
    `  precios unchanged=${value(report.global.pricesUnchanged)} cambiarian=${value(report.global.pricesChanging)} bloqueados=${report.global.blockedPrices}`,
    `  elegibilidad SAFE=${formatEligibility(report.global.eligibility.safe)} BLOCKED=${formatEligibility(report.global.eligibility.blocked)} PENDING=${formatEligibility(report.global.eligibility.pending_review)} COST_ONLY=${formatEligibility(report.global.eligibility.supplier_only_cost)}`,
    `  warnings=${report.global.warnings} anomalias=${report.global.anomalies} nombres inconsistentes=${report.global.inconsistentNames} presentaciones inconsistentes=${report.global.inconsistentPresentations}`,
    `  READY FOR WRITE=${report.canWrite ? 'YES' : 'NO'}`,
  );
  return lines.join('\n');
}

function formatEligibility(value: { count: number; percent: number }) {
  return `${value.count} (${value.percent}%)`;
}
