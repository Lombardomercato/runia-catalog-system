import {
  SUPPLIER_PRICE_TYPES,
  type SupplierDryRunReport,
  type SupplierPriceType,
} from './types';

export type SupplierAutomationPolicy = {
  approvedListRows: Record<SupplierPriceType, number>;
  approvedTotalProducts: number;
  approvedEligibility: {
    safe: number;
    blocked: number;
    pending_review: number;
    supplier_only_cost: number;
  };
  approvedBlockedSkus: readonly string[];
  minimumListRatio: number;
  maximumListRatio: number;
  maximumInvalidRowsRatio: number;
  maximumDuplicatesPerList: number;
  maximumPopulationDeltaPercent: number;
  priceChangesAlertPercent: number;
  maximumPriceChangesPercent: number;
  maximumBlockedProducts: number;
  maximumPendingProducts: number;
  pendingAlertThreshold: number;
};

export const VINROS_PRODUCTION_POLICY: SupplierAutomationPolicy = {
  approvedListRows: {
    retail: 3_230,
    wholesale: 3_227,
    business: 3_228,
    cost: 3_875,
  },
  approvedTotalProducts: 3_916,
  approvedEligibility: {
    safe: 3_211,
    blocked: 6,
    pending_review: 15,
    supplier_only_cost: 684,
  },
  approvedBlockedSkus: [
    'CER160B',
    'CLC037A',
    'CLC043B',
    'COM484B',
    'COS010B',
    'LUW051B',
  ],
  minimumListRatio: 0.95,
  maximumListRatio: 1.1,
  maximumInvalidRowsRatio: 0.001,
  maximumDuplicatesPerList: 0,
  maximumPopulationDeltaPercent: 2,
  priceChangesAlertPercent: 5,
  maximumPriceChangesPercent: 25,
  maximumBlockedProducts: 12,
  maximumPendingProducts: 30,
  pendingAlertThreshold: 20,
};

export type SupplierAutomationDecision = {
  canWrite: boolean;
  blockingReasons: string[];
  alertReasons: string[];
  priceChangesPercent: number;
  populationDeltaPercent: number;
  newlyBlockedSkus: string[];
};

export function evaluateSupplierAutomationReport(
  report: SupplierDryRunReport,
  policy: SupplierAutomationPolicy = VINROS_PRODUCTION_POLICY,
): SupplierAutomationDecision {
  const blockingReasons: string[] = [];
  const alertReasons: string[] = [];

  if (!report.snapshotAvailable) {
    blockingReasons.push('El snapshot productivo no está disponible.');
  }
  if (!report.canWrite) {
    blockingReasons.push('Los guardrails del importador bloquearon el write.');
  }

  for (const priceType of SUPPLIER_PRICE_TYPES) {
    const list = report.lists[priceType];
    const baseline = policy.approvedListRows[priceType];
    const ratio = baseline > 0 ? list.rowsValid / baseline : 0;
    const invalidRatio = list.rowsTotal > 0 ? list.rowsInvalid / list.rowsTotal : 1;

    if (list.approvedBaselineRows !== baseline) {
      blockingReasons.push(`${priceType}: el baseline configurado no coincide con el aprobado.`);
    }
    if (ratio < policy.minimumListRatio) {
      blockingReasons.push(`${priceType}: la lista cayó por debajo de ${formatPercent(policy.minimumListRatio * 100)} del baseline.`);
    } else if (ratio < 1) {
      alertReasons.push(`${priceType}: la lista está debajo del baseline aprobado (${list.rowsValid}/${baseline}).`);
    }
    if (ratio > policy.maximumListRatio) {
      blockingReasons.push(`${priceType}: la lista creció por encima de ${formatPercent(policy.maximumListRatio * 100)} del baseline.`);
    } else if (ratio > 1) {
      alertReasons.push(`${priceType}: la lista cambió respecto del baseline (${list.rowsValid}/${baseline}).`);
    }
    if (invalidRatio > policy.maximumInvalidRowsRatio) {
      blockingReasons.push(`${priceType}: hay demasiadas filas inválidas.`);
    }
    if (list.duplicates > policy.maximumDuplicatesPerList) {
      blockingReasons.push(`${priceType}: hay duplicados fuera de la tolerancia aprobada.`);
    }
    if (!list.contentFingerprint) {
      blockingReasons.push(`${priceType}: falta la huella del contenido descargado.`);
    }
  }

  const newProducts = report.global.newProducts ?? policy.approvedTotalProducts;
  const missingProducts = report.global.missingProducts ?? policy.approvedTotalProducts;
  const populationDeltaPercent = percent(
    newProducts + missingProducts,
    policy.approvedTotalProducts,
  );
  if (populationDeltaPercent > policy.maximumPopulationDeltaPercent) {
    blockingReasons.push(
      `La población cambió ${formatPercent(populationDeltaPercent)}; máximo automático ${formatPercent(policy.maximumPopulationDeltaPercent)}.`,
    );
  } else if (newProducts > 0 || missingProducts > 0) {
    alertReasons.push(`Productos nuevos=${newProducts}; faltantes=${missingProducts}.`);
  }

  const plannedPrices =
    (report.global.pricesChanging ?? 0) + (report.global.pricesUnchanged ?? 0);
  const priceChangesPercent = percent(report.global.pricesChanging ?? 0, plannedPrices);
  if (priceChangesPercent > policy.maximumPriceChangesPercent) {
    blockingReasons.push(
      `Cambiaría ${formatPercent(priceChangesPercent)} de los precios promovibles; máximo automático ${formatPercent(policy.maximumPriceChangesPercent)}.`,
    );
  } else if (priceChangesPercent > policy.priceChangesAlertPercent) {
    alertReasons.push(
      `Cambiarían ${report.global.pricesChanging} precios (${formatPercent(priceChangesPercent)}).`,
    );
  }

  const blockedProducts = report.global.eligibility.blocked.count;
  const pendingProducts = report.global.eligibility.pending_review.count;
  if (blockedProducts > policy.maximumBlockedProducts) {
    blockingReasons.push(`La cantidad de BLOCKED explotó a ${blockedProducts}.`);
  }
  if (pendingProducts > policy.maximumPendingProducts) {
    blockingReasons.push(`La cantidad de PENDING_REVIEW subió a ${pendingProducts}.`);
  } else if (pendingProducts > policy.pendingAlertThreshold) {
    alertReasons.push(`PENDING_REVIEW subió a ${pendingProducts}.`);
  }

  const approvedBlocked = new Set(policy.approvedBlockedSkus.map(normalizeSku));
  const observedBlocked = new Set(
    report.anomalies
      .filter((item) => item.blocking && item.supplierSku)
      .map((item) => normalizeSku(item.supplierSku!)),
  );
  const newlyBlockedSkus = [...observedBlocked]
    .filter((sku) => !approvedBlocked.has(sku))
    .sort();
  if (newlyBlockedSkus.length > 0) {
    blockingReasons.push(`Aparecieron nuevos BLOCKED: ${newlyBlockedSkus.join(', ')}.`);
  }

  for (const [status, expected] of Object.entries(policy.approvedEligibility) as Array<
    [keyof SupplierAutomationPolicy['approvedEligibility'], number]
  >) {
    const actual = report.global.eligibility[status].count;
    if (actual !== expected) {
      alertReasons.push(`${status}: ${actual} (baseline ${expected}).`);
    }
  }

  return {
    canWrite: blockingReasons.length === 0,
    blockingReasons: unique(blockingReasons),
    alertReasons: unique([...blockingReasons, ...alertReasons]),
    priceChangesPercent,
    populationDeltaPercent,
    newlyBlockedSkus,
  };
}

export function supplierReportsMatch(
  approvedDryRun: SupplierDryRunReport,
  writeCandidate: SupplierDryRunReport,
) {
  return JSON.stringify(reportIdentity(approvedDryRun)) === JSON.stringify(reportIdentity(writeCandidate));
}

export function summarizeSupplierDryRun(
  report: SupplierDryRunReport,
  decision: SupplierAutomationDecision,
) {
  return {
    generatedAt: report.generatedAt,
    canWrite: report.canWrite,
    policyCanWrite: decision.canWrite,
    blockingReasons: decision.blockingReasons,
    alertReasons: decision.alertReasons,
    lists: Object.fromEntries(
      SUPPLIER_PRICE_TYPES.map((priceType) => {
        const list = report.lists[priceType];
        return [priceType, {
          rowsTotal: list.rowsTotal,
          rowsValid: list.rowsValid,
          rowsInvalid: list.rowsInvalid,
          duplicates: list.duplicates,
          baselineRows: list.approvedBaselineRows,
          contentFingerprint: list.contentFingerprint,
          sourceEmissionDate: list.sourceEmissionDate,
          fetchedAt: list.fetchedAt,
          integrityStatus: list.integrityStatus,
        }];
      }),
    ),
    global: {
      uniqueSkus: report.global.uniqueSkus,
      newProducts: report.global.newProducts,
      missingProducts: report.global.missingProducts,
      pricesChanging: report.global.pricesChanging,
      pricesUnchanged: report.global.pricesUnchanged,
      priceChangesPercent: decision.priceChangesPercent,
      populationDeltaPercent: decision.populationDeltaPercent,
      eligibility: report.global.eligibility,
      blockedPrices: report.global.blockedPrices,
      anomalies: report.global.anomalies,
    },
  };
}

function reportIdentity(report: SupplierDryRunReport) {
  return {
    lists: Object.fromEntries(
      SUPPLIER_PRICE_TYPES.map((priceType) => {
        const list = report.lists[priceType];
        return [priceType, {
          fingerprint: list.contentFingerprint,
          rowsValid: list.rowsValid,
          rowsInvalid: list.rowsInvalid,
          duplicates: list.duplicates,
        }];
      }),
    ),
    global: {
      uniqueSkus: report.global.uniqueSkus,
      newProducts: report.global.newProducts,
      missingProducts: report.global.missingProducts,
      pricesChanging: report.global.pricesChanging,
      pricesUnchanged: report.global.pricesUnchanged,
      eligibility: report.global.eligibility,
    },
  };
}

function normalizeSku(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 10_000) / 100 : 0;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100) / 100}%`;
}

function unique(values: string[]) {
  return [...new Set(values)];
}
