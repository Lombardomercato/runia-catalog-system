import { normalizeSupplierName, normalizePresentation } from './parser';
import {
  DEFAULT_SUPPLIER_GUARDRAILS,
  SUPPLIER_PRODUCT_ELIGIBILITY_STATUSES,
  SUPPLIER_PRICE_TYPES,
  type ParsedSupplierSource,
  type PlannedSupplierAnomaly,
  type PlannedSupplierProduct,
  type SupplierGuardrails,
  type SupplierPriceType,
  type SupplierProductEligibilityStatus,
  type SupplierSourceDefinition,
  type SupplierSyncPlan,
  type SupplierSyncSnapshot,
} from './types';

type Consolidated = { supplierSku: string; rows: Partial<Record<SupplierPriceType, ParsedSupplierSource['products'][number]>> };

export function planSupplierSync(input: {
  supplierCode: string;
  sources: ParsedSupplierSource[];
  sourceDefinitions: SupplierSourceDefinition[];
  snapshot: SupplierSyncSnapshot;
  now: Date;
  guardrails?: Partial<SupplierGuardrails>;
}): SupplierSyncPlan {
  const guardrails = { ...DEFAULT_SUPPLIER_GUARDRAILS, ...input.guardrails };
  validateGuardrails(guardrails);
  const anomalies: PlannedSupplierAnomaly[] = [];
  const sourcesByType = new Map(input.sources.map((source) => [source.priceType, source]));
  const definitionsByType = new Map(input.sourceDefinitions.map((source) => [source.priceType, source]));

  validateSourceSet(input.sources, input.sourceDefinitions, guardrails, anomalies);
  validateEmissionDates(input.sources, input.now, guardrails, anomalies);

  const consolidated = consolidateSources(input.sources.filter((source) => source.readable));
  const existing = new Map(input.snapshot.products.map((product) => [product.supplierSku, product]));
  const medians = Object.fromEntries(SUPPLIER_PRICE_TYPES.map((type) => [type, median(sourcesByType.get(type)?.products.map((row) => row.price) ?? [])])) as Record<SupplierPriceType, number | null>;
  const products: PlannedSupplierProduct[] = [];

  for (const item of [...consolidated.values()].sort((a, b) => a.supplierSku.localeCompare(b.supplierSku))) {
    const representative = SUPPLIER_PRICE_TYPES.map((type) => item.rows[type]).find(Boolean);
    if (!representative) continue;
    const current = existing.get(item.supplierSku);
    const nameConflictAcrossLists = hasConflictingNames(item);
    const presentationConflictAcrossLists = hasConflictingPresentations(item);
    let updateCanonicalMetadata = true;
    let metadataConflict = false;

    if (!current) {
      anomalies.push(anomaly('NEW_SUPPLIER_PRODUCT', 'info', false, `Nuevo producto de proveedor: ${item.supplierSku}.`, item.supplierSku));
    } else {
      const nameChanged = namesRadicallyDifferent(current.normalizedName, representative.normalizedName);
      const presentationChanged = presentationsIncompatible(current.normalizedPresentation, representative.normalizedPresentation);
      if (nameChanged || presentationChanged) {
        updateCanonicalMetadata = false;
        metadataConflict = true;
        anomalies.push(anomaly(
          'SUPPLIER_PRODUCT_METADATA_CONFLICT', 'warning', false,
          `El codigo ${item.supplierSku} cambio radicalmente de denominacion o presentacion; se conserva la metadata canonica.`, item.supplierSku,
          null, null, null,
          { canonical: { nameRaw: current.nameRaw, presentationRaw: current.presentationRaw }, candidate: observedMetadata(item) },
        ));
      }
    }
    if (nameConflictAcrossLists) anomalies.push(anomaly(
      'SUPPLIER_PRODUCT_NAME_MISMATCH', 'warning', false,
      `El codigo ${item.supplierSku} tiene denominaciones incompatibles entre listas.`, item.supplierSku,
      null, null, null, { candidates: observedMetadata(item) },
    ));
    if (presentationConflictAcrossLists) anomalies.push(anomaly(
      'SUPPLIER_PRODUCT_PRESENTATION_MISMATCH', 'warning', false,
      `El codigo ${item.supplierSku} tiene presentaciones incompatibles entre listas.`, item.supplierSku,
      null, null, null, { candidates: observedMetadata(item) },
    ));

    const blockedTypes = validateCrossListPrices(item, guardrails, anomalies);
    const proposedPrices: PlannedSupplierProduct['prices'] = [];
    for (const priceType of SUPPLIER_PRICE_TYPES) {
      const row = item.rows[priceType];
      if (!row) {
        anomalies.push(anomaly('SUPPLIER_PRICE_TYPE_MISSING', 'warning', false, `El codigo ${item.supplierSku} no aparece en ${priceType}.`, item.supplierSku, priceType));
        continue;
      }
      const oldPrice = current?.prices[priceType] ?? null;
      const absoluteFloor = definitionsByType.get(priceType)?.absoluteMinimumPrice ?? null;
      if (row.price <= 0) {
        blockedTypes.add(priceType);
        anomalies.push(anomaly('INVALID_SUPPLIER_PRICE', 'error', true, `Precio no positivo bloqueado para ${item.supplierSku} (${priceType}).`, item.supplierSku, priceType, oldPrice, row.price, row.raw));
      } else if (absoluteFloor !== null && row.price < absoluteFloor) {
        blockedTypes.add(priceType);
        anomalies.push(anomaly('SUPPLIER_PRICE_BELOW_PROVIDER_FLOOR', 'error', true, `Precio debajo del piso VINROS configurado para ${item.supplierSku} (${priceType}).`, item.supplierSku, priceType, oldPrice, row.price, row.raw));
      }
      const populationMedian = medians[priceType];
      if (oldPrice === null && populationMedian && (sourcesByType.get(priceType)?.products.length ?? 0) >= guardrails.populationMinimumSample) {
        const ratio = row.price / populationMedian;
        if (ratio <= guardrails.populationSmallBlockingRatio) {
          anomalies.push(anomaly('FIRST_LOAD_PRICE_OUTLIER', 'warning', false, `Precio de primera carga extremadamente bajo contra la mediana (${formatRatio(ratio)}); solo senal de triage.`, item.supplierSku, priceType, null, row.price, { ...row.raw, populationMedian }));
        } else if (ratio <= guardrails.populationSmallWarningRatio) {
          anomalies.push(anomaly('FIRST_LOAD_PRICE_OUTLIER', 'warning', false, `Precio de primera carga bajo contra la mediana (${formatRatio(ratio)}).`, item.supplierSku, priceType, null, row.price, { ...row.raw, populationMedian }));
        }
      }
      if (blockedTypes.has(priceType)) continue;
      if (oldPrice === null || oldPrice === undefined) {
        proposedPrices.push(pricePlan(priceType, 'update', row, sourcesByType.get(priceType)!));
      } else if (sameMoney(oldPrice, row.price)) {
        proposedPrices.push(pricePlan(priceType, 'unchanged', row, sourcesByType.get(priceType)!));
      } else {
        const variation = Math.abs(row.price - oldPrice) / oldPrice * 100;
        if (row.price / oldPrice <= guardrails.extremelySmallRatio || variation > guardrails.blockingVariationPercent) {
          blockedTypes.add(priceType);
          anomalies.push(anomaly('SUPPLIER_PRICE_CHANGE_BLOCKED', 'error', true, `Variacion de ${formatPercent(variation)} bloqueada para ${item.supplierSku} (${priceType}).`, item.supplierSku, priceType, oldPrice, row.price, row.raw));
        } else {
          proposedPrices.push(pricePlan(priceType, 'update', row, sourcesByType.get(priceType)!));
          if (variation > guardrails.normalVariationPercent) anomalies.push(anomaly('SUPPLIER_PRICE_CHANGE_WARNING', 'warning', false, `Variacion de ${formatPercent(variation)} aceptada con advertencia para ${item.supplierSku} (${priceType}).`, item.supplierSku, priceType, oldPrice, row.price, row.raw));
        }
      }
    }

    const onlyCost = Object.keys(item.rows).length === 1 && Boolean(item.rows.cost);
    const scaleSuspected = !onlyCost && isScale100Suspected(item, medians);
    const missingRetail = !onlyCost && !item.rows.retail;
    if (scaleSuspected) anomalies.push(anomaly(
      'SUPPLIER_PRICE_SCALE_SUSPECTED', 'warning', false,
      `Los precios de ${item.supplierSku} son coherentes entre listas pero compatibles con una escala x100; requiere confirmacion.`,
      item.supplierSku, null, null, null, { factorCandidate: 100, candidates: observedMetadata(item) },
    ));
    if (missingRetail) anomalies.push(anomaly(
      'SUPPLIER_PRODUCT_RETAIL_MISSING', 'warning', false,
      `El producto ${item.supplierSku} no tiene precio retail y queda pendiente de revision.`,
      item.supplierSku, 'retail', null, null, { candidates: observedMetadata(item) },
    ));

    const eligibilityStatus: SupplierProductEligibilityStatus = blockedTypes.size > 0
      ? 'blocked'
      : scaleSuspected || missingRetail || metadataConflict || nameConflictAcrossLists || presentationConflictAcrossLists
        ? 'pending_review'
        : onlyCost
          ? 'supplier_only_cost'
          : 'safe';
    const prices = eligibilityStatus === 'safe'
      ? proposedPrices
      : eligibilityStatus === 'supplier_only_cost'
        ? proposedPrices.filter((price) => price.priceType === 'cost')
        : [];
    const promotedTypes = new Set(prices.map((price) => price.priceType));
    const candidatePrices = SUPPLIER_PRICE_TYPES.flatMap((priceType) => {
      const row = item.rows[priceType];
      if (!row || promotedTypes.has(priceType)) return [];
      return [candidatePrice(
        priceType,
        row,
        sourcesByType.get(priceType)!,
        eligibilityStatus === 'blocked' ? 'blocked' : 'pending_review',
      )];
    });
    products.push({
      supplierSku: item.supplierSku,
      nameRaw: representative.nameRaw,
      presentationRaw: representative.presentationRaw,
      normalizedName: representative.normalizedName,
      normalizedPresentation: representative.normalizedPresentation,
      eligibilityStatus,
      updateCanonicalMetadata,
      rawData: { observedCandidates: observedMetadata(item) },
      prices,
      candidatePrices,
    });
  }

  if (input.snapshot.available) for (const product of input.snapshot.products) if (!consolidated.has(product.supplierSku)) {
    anomalies.push(anomaly('SUPPLIER_PRODUCT_MISSING', 'warning', false, `El producto ${product.supplierSku} ya no aparece en ninguna lista.`, product.supplierSku, null, null, null, { lastSeenAt: product.lastSeenAt }));
  }

  const deduplicated = deduplicateAnomalies(anomalies);
  const lists = Object.fromEntries(SUPPLIER_PRICE_TYPES.map((type) => {
    const source = sourcesByType.get(type) ?? unreadableSource(definitionsByType.get(type)!);
    const baseline = definitionsByType.get(type)?.approvedBaselineRows ?? null;
    const sourceAnomalies = deduplicated.filter((item) => item.supplierSku === null && item.priceType === type);
    const blockingFailures = [...new Set([...source.issues.filter((item) => item.blocking).map((item) => item.message), ...sourceAnomalies.filter((item) => item.blocking).map((item) => item.message)])];
    const warnings = [...new Set([...source.issues.filter((item) => !item.blocking).map((item) => item.message), ...sourceAnomalies.filter((item) => !item.blocking).map((item) => item.message)])];
    return [type, {
      priceType: type,
      expectedListNumber: source.expectedListNumber,
      detectedListNumber: source.detectedListNumber,
      sourceEmissionDate: source.sourceEmissionDate,
      sourceHttpLastModified: source.sourceHttpLastModified,
      fetchedAt: source.fetchedAt,
      contentFingerprint: source.contentFingerprint,
      rowsTotal: source.rowsRead,
      rowsValid: source.validRows,
      rowsInvalid: source.invalidRows,
      uniqueCodes: source.uniqueCodes,
      duplicates: source.duplicateRows,
      validPercent: percent(source.validRows, source.rowsRead),
      approvedBaselineRows: baseline,
      baselinePercent: baseline ? percent(source.validRows, baseline) : null,
      integrityStatus: blockingFailures.length ? 'blocking' : warnings.length ? 'warning' : 'ok',
      warnings,
      blockingFailures,
    }];
  })) as SupplierSyncPlan['report']['lists'];

  const coverage = [0, 0, 0, 0, 0];
  for (const item of consolidated.values()) coverage[Object.keys(item.rows).length] += 1;
  const plannedPrices = products.flatMap((product) => product.prices);
  const eligibility = Object.fromEntries(SUPPLIER_PRODUCT_ELIGIBILITY_STATUSES.map((status) => {
    const count = products.filter((product) => product.eligibilityStatus === status).length;
    return [status, { count, percent: percent(count, consolidated.size) }];
  })) as SupplierSyncPlan['report']['global']['eligibility'];
  const global = {
    uniqueSkus: consolidated.size,
    presentIn4: coverage[4], presentIn3: coverage[3], presentIn2: coverage[2], presentIn1: coverage[1],
    newProducts: input.snapshot.available ? [...consolidated.keys()].filter((sku) => !existing.has(sku)).length : null,
    existingProducts: input.snapshot.available ? [...consolidated.keys()].filter((sku) => existing.has(sku)).length : null,
    missingProducts: input.snapshot.available ? input.snapshot.products.filter((product) => !consolidated.has(product.supplierSku)).length : null,
    pricesUnchanged: input.snapshot.available ? plannedPrices.filter((price) => price.action === 'unchanged').length : null,
    pricesChanging: input.snapshot.available ? plannedPrices.filter((price) => price.action === 'update').length : null,
    warnings: deduplicated.filter((item) => item.severity === 'warning').length,
    blockedPrices: new Set(deduplicated.filter((item) => item.blocking && item.supplierSku && item.priceType).map((item) => `${item.supplierSku}:${item.priceType}`)).size,
    anomalies: deduplicated.length,
    inconsistentNames: new Set(deduplicated.filter((item) => item.type.includes('NAME_MISMATCH') || item.type === 'SUPPLIER_PRODUCT_METADATA_CONFLICT').map((item) => item.supplierSku)).size,
    inconsistentPresentations: new Set(deduplicated.filter((item) => item.type.includes('PRESENTATION_MISMATCH') || item.type === 'SUPPLIER_PRODUCT_METADATA_CONFLICT').map((item) => item.supplierSku)).size,
    eligibility,
  };
  const canApply = SUPPLIER_PRICE_TYPES.every((type) => lists[type].integrityStatus !== 'blocking' && lists[type].approvedBaselineRows !== null)
    && !deduplicated.some((item) => item.blocking && item.supplierSku === null);
  const status = canApply ? (deduplicated.some((item) => item.severity !== 'info') ? 'completed_with_warnings' : 'completed') : 'failed';
  const report = {
    mode: 'dry-run' as const,
    supplierCode: input.supplierCode,
    generatedAt: input.now.toISOString(),
    canWrite: canApply,
    snapshotAvailable: input.snapshot.available,
    snapshotNote: input.snapshot.available ? null : input.snapshot.unavailableReason ?? 'Snapshot no disponible.',
    lists,
    global,
    anomalies: deduplicated,
  };
  return {
    status,
    canApply,
    productsRead: consolidated.size,
    products,
    anomalies: deduplicated,
    warnings: global.warnings,
    errors: deduplicated.filter((item) => item.severity === 'error').length,
    blockedPrices: global.blockedPrices,
    sourceSummary: { generatedAt: report.generatedAt, lists, global },
    report,
  };
}

function validateSourceSet(sources: ParsedSupplierSource[], definitions: SupplierSourceDefinition[], guardrails: SupplierGuardrails, anomalies: PlannedSupplierAnomaly[]) {
  const normalizedUrls = new Map<string, SupplierPriceType[]>();
  for (const definition of definitions) {
    const key = normalizeUrl(definition.url);
    normalizedUrls.set(key, [...normalizedUrls.get(key) ?? [], definition.priceType]);
  }
  for (const types of normalizedUrls.values()) if (types.length > 1) for (const type of types) anomalies.push(anomaly('DUPLICATE_SOURCE_URL', 'error', true, `La URL tambien esta asignada a: ${types.join(', ')}.`, null, type));
  const fingerprints = new Map<string, SupplierPriceType[]>();
  for (const source of sources) if (source.contentFingerprint) fingerprints.set(source.contentFingerprint, [...fingerprints.get(source.contentFingerprint) ?? [], source.priceType]);
  for (const types of fingerprints.values()) if (types.length > 1) for (const type of types) anomalies.push(anomaly('DUPLICATE_SOURCE_CONTENT', 'error', true, `El contenido es identico al de: ${types.join(', ')}.`, null, type));

  for (const definition of definitions) {
    const source = sources.find((item) => item.priceType === definition.priceType);
    if (!source || !source.readable) {
      anomalies.push(anomaly('SOURCE_READ_ERROR', 'error', true, source?.issues[0]?.message ?? `No se pudo leer ${definition.priceType}.`, null, definition.priceType));
      continue;
    }
    for (const item of source.issues) anomalies.push(anomaly(item.type, item.severity, item.blocking, item.message, item.supplierSku ?? null, source.priceType, null, null, item.raw ?? {}));
    if (source.validRows < guardrails.minimumProductsPerList) anomalies.push(anomaly('SOURCE_ALMOST_EMPTY', 'error', true, `La lista tiene ${source.validRows} filas validas; minimo de seguridad: ${guardrails.minimumProductsPerList}.`, null, source.priceType));
    if (definition.approvedBaselineRows === null) anomalies.push(anomaly('SOURCE_BASELINE_NOT_APPROVED', 'warning', false, 'No existe baseline aprobado: esta fuente solo puede evaluarse en dry-run.', null, source.priceType));
    else {
      const ratio = source.validRows / definition.approvedBaselineRows;
      if (ratio < guardrails.baselineBlockingRatio) anomalies.push(anomaly('SOURCE_BELOW_BASELINE', 'error', true, `Filas validas al ${formatPercent(ratio * 100)} del baseline (${definition.approvedBaselineRows}).`, null, source.priceType));
      else if (ratio < guardrails.baselineWarningRatio) anomalies.push(anomaly('SOURCE_BELOW_BASELINE', 'warning', false, `Filas validas al ${formatPercent(ratio * 100)} del baseline (${definition.approvedBaselineRows}).`, null, source.priceType));
    }
    const invalidRatio = source.rowsRead ? source.invalidRows / source.rowsRead : 1;
    if (invalidRatio > guardrails.invalidRowsBlockingRatio) anomalies.push(anomaly('SOURCE_INVALID_ROWS', 'error', true, `${formatPercent(invalidRatio * 100)} de filas invalidas.`, null, source.priceType));
    else if (invalidRatio > guardrails.invalidRowsWarningRatio) anomalies.push(anomaly('SOURCE_INVALID_ROWS', 'warning', false, `${formatPercent(invalidRatio * 100)} de filas invalidas.`, null, source.priceType));
  }
}

function validateEmissionDates(sources: ParsedSupplierSource[], now: Date, guardrails: SupplierGuardrails, anomalies: PlannedSupplierAnomaly[]) {
  const dated = sources.flatMap((source) => source.sourceEmissionDate ? [{ source, time: Date.parse(`${source.sourceEmissionDate}T00:00:00Z`) }] : []);
  if (dated.length > 1) {
    const spread = (Math.max(...dated.map((item) => item.time)) - Math.min(...dated.map((item) => item.time))) / 86_400_000;
    if (spread > guardrails.emissionDateSpreadWarningDays) for (const item of dated) anomalies.push(anomaly('SOURCE_EMISSION_DATE_SPREAD', 'warning', false, `Las fechas de emision difieren ${Math.round(spread)} dias.`, null, item.source.priceType));
  }
  for (const item of dated) {
    const age = (inputTime(now) - item.time) / 86_400_000;
    if (age > guardrails.emissionDateAgeWarningDays) anomalies.push(anomaly('SOURCE_EMISSION_DATE_OLD', 'warning', false, `La fecha de emision tiene ${Math.floor(age)} dias.`, null, item.source.priceType));
  }
}

function validateCrossListPrices(item: Consolidated, guardrails: SupplierGuardrails, anomalies: PlannedSupplierAnomaly[]) {
  const blocked = new Set<SupplierPriceType>();
  const value = (type: SupplierPriceType) => item.rows[type]?.price;
  const retail = value('retail'); const wholesale = value('wholesale'); const business = value('business'); const cost = value('cost');
  const raw = (type: SupplierPriceType) => ({ ...item.rows[type]?.raw, observedPrices: observedPrices(item) });
  const block = (type: SupplierPriceType, anomalyType: string, message: string) => {
    blocked.add(type);
    anomalies.push(anomaly(anomalyType, 'error', true, message, item.supplierSku, type, null, value(type) ?? null, raw(type)));
  };
  const hierarchy = (upperType: SupplierPriceType, lowerType: SupplierPriceType, anomalyType: string, label: string) => {
    const upper = value(upperType); const lower = value(lowerType);
    if (upper === undefined || lower === undefined || lower <= upper) return;
    const ratio = upper > 0 ? lower / upper : Infinity;
    if (ratio > guardrails.hierarchyBlockingOverageRatio) {
      block(lowerType, anomalyType, `${label} supera materialmente a ${upperType} (${formatPercent((ratio - 1) * 100)}).`);
    } else {
      anomalies.push(anomaly(
        'CROSS_LIST_HIERARCHY_WARNING', 'warning', false,
        `${label} supera levemente a ${upperType} (${formatPercent((ratio - 1) * 100)}); posible rounding.`,
        item.supplierSku, lowerType, null, lower, raw(lowerType),
      ));
    }
  };

  hierarchy('retail', 'wholesale', 'CROSS_LIST_WHOLESALE_ABOVE_RETAIL', 'Wholesale');
  hierarchy('wholesale', 'business', 'CROSS_LIST_BUSINESS_ABOVE_WHOLESALE', 'Business');
  if (wholesale === undefined) hierarchy('retail', 'business', 'CROSS_LIST_BUSINESS_ABOVE_RETAIL', 'Business');
  hierarchy('retail', 'cost', 'CROSS_LIST_COST_ABOVE_RETAIL', 'Costo');
  if (business !== undefined && cost !== undefined && cost > business && (retail === undefined || cost <= retail)) {
    anomalies.push(anomaly(
      'CROSS_LIST_COST_ABOVE_BUSINESS_WARNING', 'warning', false,
      'Costo mayor que business, pero no supera retail materialmente.',
      item.supplierSku, 'cost', null, cost, raw('cost'),
    ));
  }
  const available = SUPPLIER_PRICE_TYPES.flatMap((type) => value(type) === undefined ? [] : [{ type, price: value(type)! }]);
  if (available.length >= 2) {
    const min = Math.min(...available.map((entry) => entry.price)); const max = Math.max(...available.map((entry) => entry.price)); const ratio = min > 0 ? max / min : Infinity;
    if (ratio >= guardrails.crossListBlockingRatio) for (const entry of available) block(entry.type, 'CROSS_LIST_EXTREME_RATIO', `Ratio extremo entre listas (${formatRatio(ratio)}).`);
    else if (ratio >= guardrails.crossListWarningRatio) anomalies.push(anomaly('CROSS_LIST_RATIO_WARNING', 'warning', false, `Ratio inusual entre listas (${formatRatio(ratio)}).`, item.supplierSku, null, null, null, { observedPrices: observedPrices(item) }));
  }
  return blocked;
}

function consolidateSources(sources: ParsedSupplierSource[]) {
  const result = new Map<string, Consolidated>();
  for (const source of sources) for (const row of source.products) {
    const item = result.get(row.supplierSku) ?? { supplierSku: row.supplierSku, rows: {} };
    item.rows[source.priceType] = row; result.set(row.supplierSku, item);
  }
  return result;
}
function pricePlan(priceType: SupplierPriceType, action: 'update' | 'unchanged', row: ParsedSupplierSource['products'][number], source: ParsedSupplierSource) {
  return { priceType, action, newPrice: row.price, sourceEmissionDate: source.sourceEmissionDate, sourceHttpLastModified: source.sourceHttpLastModified, fetchedAt: source.fetchedAt, rawData: row.raw };
}
function candidatePrice(priceType: SupplierPriceType, row: ParsedSupplierSource['products'][number], source: ParsedSupplierSource, reason: string) {
  return { priceType, observedPrice: row.price, reason, sourceEmissionDate: source.sourceEmissionDate, sourceHttpLastModified: source.sourceHttpLastModified, fetchedAt: source.fetchedAt, rawData: row.raw };
}
function anomaly(type: string, severity: PlannedSupplierAnomaly['severity'], blocking: boolean, message: string, supplierSku: string | null, priceType: SupplierPriceType | null = null, oldPrice: number | null = null, observedPrice: number | null = null, rawData: Record<string, unknown> = {}): PlannedSupplierAnomaly {
  return { fingerprint: [type, supplierSku ?? '-', priceType ?? '-', observedPrice ?? '-'].join(':'), type, severity, blocking, message, supplierSku, priceType, oldPrice, observedPrice, rawData };
}
function deduplicateAnomalies(items: PlannedSupplierAnomaly[]) { return [...new Map(items.map((item) => [item.fingerprint, item])).values()]; }
function observedMetadata(item: Consolidated) { return Object.fromEntries(SUPPLIER_PRICE_TYPES.flatMap((type) => item.rows[type] ? [[type, { nameRaw: item.rows[type]!.nameRaw, presentationRaw: item.rows[type]!.presentationRaw, normalizedPresentation: item.rows[type]!.normalizedPresentation, price: item.rows[type]!.price, raw: item.rows[type]!.raw }]] : [])); }
function observedPrices(item: Consolidated) { return Object.fromEntries(SUPPLIER_PRICE_TYPES.flatMap((type) => item.rows[type] ? [[type, item.rows[type]!.price]] : [])); }
function hasConflictingNames(item: Consolidated) { const values = SUPPLIER_PRICE_TYPES.flatMap((type) => item.rows[type]?.normalizedName ? [item.rows[type]!.normalizedName] : []); return values.some((value, index) => values.slice(index + 1).some((other) => namesRadicallyDifferent(value, other))); }
function hasConflictingPresentations(item: Consolidated) { const values = [...new Set(SUPPLIER_PRICE_TYPES.flatMap((type) => item.rows[type]?.normalizedPresentation ? [item.rows[type]!.normalizedPresentation!] : []))]; return values.length > 1; }
export function presentationsIncompatible(left: string | null, right: string | null) { const a = normalizePresentation(left); const b = normalizePresentation(right); return Boolean(a && b && a !== b); }
export function namesRadicallyDifferent(left: string, right: string) {
  const a = normalizeSupplierName(left); const b = normalizeSupplierName(right);
  if (!a || !b || a === b || a.includes(b) || b.includes(a)) return false;
  const tokensA = new Set(a.split(' ')); const tokensB = new Set(b.split(' ')); const common = [...tokensA].filter((token) => tokensB.has(token)).length;
  return common / Math.max(tokensA.size, tokensB.size) < 0.4;
}
function median(values: number[]) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function isScale100Suspected(item: Consolidated, medians: Record<SupplierPriceType, number | null>) {
  const available = SUPPLIER_PRICE_TYPES.flatMap((type) => item.rows[type] ? [{ type, price: item.rows[type]!.price }] : []);
  if (available.length < 3 || !item.rows.retail || Math.max(...available.map((entry) => entry.price)) > 500) return false;
  if (Math.min(...available.map((entry) => entry.price)) <= 0 || Math.max(...available.map((entry) => entry.price)) / Math.min(...available.map((entry) => entry.price)) > 2.5) return false;
  const retail = item.rows.retail.price; const wholesale = item.rows.wholesale?.price; const business = item.rows.business?.price; const cost = item.rows.cost?.price;
  if ((wholesale !== undefined && retail < wholesale) || (business !== undefined && wholesale !== undefined && wholesale < business) || (cost !== undefined && business !== undefined && business < cost)) return false;
  const representative = item.rows.retail ?? item.rows.wholesale ?? item.rows.business ?? item.rows.cost;
  if (!representative || representative.normalizedPresentation !== '750 ml') return false;
  if (/\b(bolsa|caja|envase|pack|vaso|copa|accesorio|friselina|estuche)\b/.test(representative.normalizedName)) return false;
  return available.filter(({ type, price }) => {
    const populationMedian = medians[type];
    if (!populationMedian) return false;
    const scaledRatio = price * 100 / populationMedian;
    return scaledRatio >= 0.25 && scaledRatio <= 4;
  }).length >= 3;
}
function unreadableSource(definition: SupplierSourceDefinition): ParsedSupplierSource { return { priceType: definition.priceType, expectedListNumber: definition.expectedListNumber, detectedListNumber: null, sourceUrl: definition.url, contentFingerprint: null, sourceEmissionDate: null, sourceHttpLastModified: null, fetchedAt: new Date(0).toISOString(), rowsRead: 0, validRows: 0, invalidRows: 0, duplicateRows: 0, uniqueCodes: 0, products: [], issues: [], readable: false, integrityStatus: 'blocking' }; }
function normalizeUrl(value: string) { try { const url = new URL(value); url.hash = ''; return url.toString(); } catch { return value.trim(); } }
function sameMoney(left: number, right: number) { return Math.abs(left - right) < 0.000001; }
function formatPercent(value: number) { return `${Math.round(value * 100) / 100}%`; }
function formatRatio(value: number) { return `${Math.round(value * 100) / 100}x`; }
function percent(part: number, total: number) { return total > 0 ? Math.round(part / total * 10_000) / 100 : 0; }
function inputTime(value: Date) { return value.getTime(); }
function validateGuardrails(value: SupplierGuardrails) {
  if (value.normalVariationPercent < 0 || value.blockingVariationPercent <= value.normalVariationPercent) throw new Error('Umbrales de variacion invalidos.');
  for (const [name, ratio] of Object.entries(value).filter(([key]) => key.toLowerCase().includes('ratio'))) if (ratio <= 0) throw new Error(`${name} debe ser positivo.`);
  if (value.baselineBlockingRatio >= value.baselineWarningRatio || value.invalidRowsWarningRatio >= value.invalidRowsBlockingRatio) throw new Error('Umbrales de integridad invalidos.');
}
