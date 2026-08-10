import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { SupplierSnapshotReader, SupplierSourceLoader, SupplierSyncWriter } from './interfaces';
import { paginateRange } from './pagination';
import { normalizePresentation, parseSupplierDocument, parseSupplierRows } from './parser';
import { planSupplierSync } from './planner';
import { formatSupplierDryRunReport } from './report';
import { SyncSupplierPrices } from './service';
import { downloadableGoogleSheetUrl } from '../../modules/suppliers/HttpSupplierSheetLoader';
import {
  SUPPLIER_PRICE_TYPES,
  type ParsedSupplierSource,
  type SupplierPriceType,
  type SupplierRunHandle,
  type SupplierSourceDefinition,
  type SupplierSyncPlan,
  type SupplierSyncSnapshot,
} from './types';

const NOW = new Date('2026-08-07T12:00:00Z');

test('CSV: extrae identidad, fecha comercial, metricas y normaliza precios/presentacion', async () => {
  const csv = 'Precio de Lista 1;;;\nFecha de Emisión;06/08/2026;;\nCódigo;Denominación;Presentación;Precio c/IVA\n abs001 ;Fernet Clásico;750 c.c.;$ 1.234,50';
  const parsed = await parseSupplierDocument({ content: new TextEncoder().encode(csv), contentType: 'text/csv', source: definitions()[0], fetchedAt: NOW.toISOString() });
  assert.equal(parsed.detectedListNumber, 1);
  assert.equal(parsed.sourceEmissionDate, '2026-08-06');
  assert.equal(parsed.products[0].price, 1234.5);
  assert.equal(parsed.products[0].normalizedPresentation, '750 ml');
  assert.equal(parsed.validRows, 1);
  assert.equal(parsed.integrityStatus, 'ok');
});

test('rechaza HTML/login, CSV corrupto, XLSX corrupto y content-type extraño', async () => {
  const base = { source: definitions()[0], fetchedAt: NOW.toISOString() };
  await assert.rejects(parseSupplierDocument({ ...base, content: new TextEncoder().encode('<html><title>Google Sign in</title>'), contentType: 'text/html' }), /SOURCE_HTML/);
  await assert.rejects(parseSupplierDocument({ ...base, content: new TextEncoder().encode('"sin cerrar'), contentType: 'text/csv' }), /SOURCE_CSV_CORRUPT/);
  await assert.rejects(parseSupplierDocument({ ...base, content: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), /SOURCE_XLSX_CORRUPT/);
  await assert.rejects(parseSupplierDocument({ ...base, content: new TextEncoder().encode('a,b'), contentType: 'application/pdf' }), /SOURCE_CONTENT_TYPE/);
  await assert.rejects(parseSupplierDocument({ ...base, content: readFileSync('docs/RB_SHEET_MAESTRO_PILOTO.xlsx'), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), /SOURCE_HEADER_MISSING/);
});

test('bloquea lista equivocada, duplicados y mas de 5% de filas invalidas', () => {
  const wrong = source('retail', [['A', 'Producto', '750cc', 100]], { detectedList: 4 });
  assert.ok(wrong.issues.some((item) => item.type === 'SOURCE_IDENTITY_MISMATCH' && item.blocking));
  const duplicate = source('retail', [['A', 'Uno', '750cc', 100], ['A', 'Dos', '750cc', 100]]);
  assert.equal(duplicate.products.length, 0);
  assert.equal(duplicate.duplicateRows, 2);
  const invalid = source('retail', Array.from({ length: 19 }, (_, index) => [`S${index}`, 'Producto', '750cc', index === 0 ? 'no-price' : 100]));
  const result = plan([invalid, ...SUPPLIER_PRICE_TYPES.slice(1).map((type) => source(type, [[`S-${type}`, 'Producto', '750cc', 100]]))]);
  assert.equal(result.report.lists.retail.integrityStatus, 'blocking');
});

test('Google Sheets exige gid explicito y Lista 2 conserva identidad de contenido', () => {
  const list2 = 'https://docs.google.com/spreadsheets/d/1RKu0ldsucFIk0fXCVh2KHSi1EVTPM7Gz/edit?gid=223050305#gid=223050305';
  assert.equal(
    downloadableGoogleSheetUrl(list2),
    'https://docs.google.com/spreadsheets/d/1RKu0ldsucFIk0fXCVh2KHSi1EVTPM7Gz/export?format=csv&gid=223050305',
  );
  assert.throws(() => downloadableGoogleSheetUrl('https://docs.google.com/spreadsheets/d/documento/edit'), /SOURCE_GOOGLE_SHEET_GID_REQUIRED/);
  const wrongTab = source('wholesale', [['SKU', 'Producto', '750cc', 100]], { detectedList: 1 });
  assert.ok(wrongTab.issues.some((item) => item.type === 'SOURCE_IDENTITY_MISMATCH' && item.blocking));
  const missingIdentity = parseSupplierRows({
    priceType: 'wholesale', expectedListNumber: 2,
    rows: [['Codigo', 'Denominacion', 'Presentacion', 'Precio c/IVA'], ['SKU', 'Producto', '750cc', 100]],
  });
  assert.ok(missingIdentity.issues.some((item) => item.type === 'SOURCE_IDENTITY_NOT_FOUND' && item.blocking));
});

test('bloquea cuatro listas truncadas de forma equivalente y primer write sin baseline', () => {
  const truncated = SUPPLIER_PRICE_TYPES.map((type) => source(type, [[`S-${type}`, 'Producto', '750cc', 100]]));
  const result = plan(truncated, availableSnapshot(), { minimumProductsPerList: 10 }, definitions(null));
  assert.equal(result.canApply, false);
  assert.ok(SUPPLIER_PRICE_TYPES.every((type) => result.report.lists[type].integrityStatus === 'blocking'));
  assert.ok(result.anomalies.some((item) => item.type === 'SOURCE_BASELINE_NOT_APPROVED'));
});

test('detecta URLs repetidas y contenido identico entre fuentes', () => {
  const defs = definitions(1);
  defs[1].url = defs[0].url;
  const sources = normalSources();
  sources[2].contentFingerprint = sources[3].contentFingerprint;
  const result = plan(sources, availableSnapshot(), {}, defs);
  assert.equal(result.canApply, false);
  assert.ok(result.anomalies.some((item) => item.type === 'DUPLICATE_SOURCE_URL'));
  assert.ok(result.anomalies.some((item) => item.type === 'DUPLICATE_SOURCE_CONTENT'));
});

test('dry-run es 100% read-only aun si se inyecta un writer', async () => {
  const writer = new CountingWriter();
  const service = new SyncSupplierPrices(new FixtureLoader(normalSources()), new FixtureSnapshotReader(availableSnapshot()), writer);
  const result = await service.execute(serviceInput(true));
  assert.equal(result.mode, 'dry-run');
  assert.equal(writer.opened, 0);
  assert.equal(writer.applied, 0);
  assert.match(formatSupplierDryRunReport(result), /READY FOR WRITE=YES/);
});

test('dry-run funciona sin credenciales/snapshot y retorna N/D programatico', async () => {
  const service = new SyncSupplierPrices(new FixtureLoader(normalSources()));
  const result = await service.execute(serviceInput(true));
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.snapshotAvailable, false);
  assert.equal(result.global.newProducts, null);
  assert.equal(result.global.pricesChanging, null);
});

test('write all-or-nothing no abre run ante una fuente critica', async () => {
  const writer = new CountingWriter();
  const sources = normalSources();
  const loader = new FixtureLoader(sources, 'cost');
  const service = new SyncSupplierPrices(loader, new FixtureSnapshotReader(availableSnapshot()), writer);
  await assert.rejects(service.execute(serviceInput(false)), /WRITE_BLOCKED_BY_SOURCE_INTEGRITY/);
  assert.deepEqual({ opened: writer.opened, applied: writer.applied, failed: writer.failed }, { opened: 0, applied: 0, failed: 0 });
});

test('validador pre-write aborta antes de crear supplier o sync run', async () => {
  const writer = new CountingWriter();
  const service = new SyncSupplierPrices(new FixtureLoader(normalSources()), new FixtureSnapshotReader(availableSnapshot()), writer);
  await assert.rejects(service.execute({
    ...serviceInput(false),
    beforeWrite: () => { throw new Error('APPROVED_DRY_MISMATCH'); },
  }), /APPROVED_DRY_MISMATCH/);
  assert.deepEqual({ opened: writer.opened, applied: writer.applied, failed: writer.failed }, { opened: 0, applied: 0, failed: 0 });
});

test('producto nuevo con precios absurdos, cost > retail y ratios extremos queda bloqueado', () => {
  const sources = [
    source('retail', [['BAD', 'Producto', '750cc', 100]]),
    source('wholesale', [['BAD', 'Producto', '750 cc', 1000]]),
    source('business', [['BAD', 'Producto', '750c.c.', 2000]]),
    source('cost', [['BAD', 'Producto', '750 ml', 5000]]),
  ];
  const result = plan(sources);
  assert.ok(result.report.global.blockedPrices > 0);
  assert.ok(result.anomalies.some((item) => item.type === 'CROSS_LIST_COST_ABOVE_RETAIL'));
  assert.ok(result.anomalies.some((item) => item.type === 'CROSS_LIST_EXTREME_RATIO'));
  assert.equal(result.products[0].prices.length, 0);
  assert.equal(result.products[0].eligibilityStatus, 'blocked');
  assert.equal(result.products[0].candidatePrices.length, 4);
});

test('ALT, BDS y VM coherentes pero compatibles con escala x100 quedan pending sin current', () => {
  const normal = Array.from({ length: 25 }, (_, index) => ({ sku: `NORMAL-${index}`, name: `Vino normal ${index}`, presentation: '750cc' }));
  const pending = [
    { sku: 'ALT001B', name: 'ROJO DE ALTURA Blend x 750 c.c.', presentation: '750cc', prices: [140, 128.3, 103.65, 95.98] },
    { sku: 'ALT002B', name: 'ROJO DE ALTURA Cabernet x 750 c.c.', presentation: '750cc', prices: [140, 128.3, 103.65, 95.98] },
    { sku: 'BDS005B', name: 'DF Tequila Blanco x 750 c.c.', presentation: '750cc', prices: [110, 105.05, 86.05, 80.8] },
    { sku: 'VM020B', name: 'PERLAJE DEL SUR Extra Brut x750cc', presentation: '750cc', prices: [135.05, 121.65, 98.35, 91.05] },
  ];
  const normalPrices = [14_000, 12_800, 10_400, 8_000];
  const sources = SUPPLIER_PRICE_TYPES.map((type, typeIndex) => source(type, [
    ...normal.map((item) => [item.sku, item.name, item.presentation, normalPrices[typeIndex]] as [string, string, string, unknown]),
    ...pending.map((item) => [item.sku, item.name, item.presentation, item.prices[typeIndex]] as [string, string, string, unknown]),
  ]));
  const result = plan(sources);
  for (const expected of pending) {
    const product = result.products.find((item) => item.supplierSku === expected.sku)!;
    assert.equal(product.eligibilityStatus, 'pending_review', expected.sku);
    assert.equal(product.prices.length, 0, expected.sku);
    assert.equal(product.candidatePrices.length, 4, expected.sku);
    assert.ok(result.anomalies.some((item) => item.supplierSku === expected.sku && item.type === 'SUPPLIER_PRICE_SCALE_SUSPECTED'));
  }
});

test('BOL01 tolera rounding de jerarquia y queda safe con warning', () => {
  const prices = [200, 200, 200, 200.25];
  const result = plan(SUPPLIER_PRICE_TYPES.map((type, index) => source(type, [['BOL01', 'BOLSA FRISELINA P/1 botella', '', prices[index]]])));
  const product = result.products[0];
  assert.equal(product.eligibilityStatus, 'safe');
  assert.equal(product.prices.length, 4);
  assert.ok(result.anomalies.some((item) => item.supplierSku === 'BOL01' && item.type === 'CROSS_LIST_HIERARCHY_WARNING' && !item.blocking));
  assert.ok(!result.anomalies.some((item) => item.supplierSku === 'BOL01' && item.blocking));
});

test('cinco inconsistencias reales quedan blocked y nunca promueven current', () => {
  const cases = [
    { sku: 'CLC037A', name: 'BARILOCHE Mani C/Chocolate Semi x 80grs', prices: [0.1, null, null, 256.1] },
    { sku: 'COM484B', name: 'NESCAFE Gold Instantaneo x 100 grs', prices: [24055.85, 22287.3, 18215.35, 468.1] },
    { sku: 'CER160B', name: 'PATAGONIA IPA 24.7 x 730 c.c.', prices: [4702.5, 4388.95, 3605.25, 129.45] },
    { sku: 'CLC043B', name: 'BARILOCHE T/Praline Chocoalmendras x180G', prices: [12426.8, 11484.1, 9855.75, 572.15] },
    { sku: 'LUW051B', name: 'LUI Esp. Brut Nature Pinot Noir x 750 c.', prices: [11166.55, 10317.5, 8420.25, 634.7] },
  ];
  for (const item of cases) {
    const sources = SUPPLIER_PRICE_TYPES.map((type, index) => source(type, item.prices[index] === null ? [] : [[item.sku, item.name, '750cc', item.prices[index]]]));
    const result = plan(sources);
    const product = result.products.find((candidate) => candidate.supplierSku === item.sku)!;
    assert.equal(product.eligibilityStatus, 'blocked', item.sku);
    assert.equal(product.prices.length, 0, item.sku);
    assert.equal(product.candidatePrices.length, item.prices.filter((price) => price !== null).length, item.sku);
  }
});

test('supplier_only_cost conserva metadata y solo costo; productos sin retail quedan pending', () => {
  const sources = [
    source('retail', [['SAFE', 'Producto seguro', '750cc', 1000]]),
    source('wholesale', [['SAFE', 'Producto seguro', '750cc', 900], ['CER259E', 'PENON DEL AGUILA 2 Latas + Pinta', 'EST.x2', 530.02]]),
    source('business', [['SAFE', 'Producto seguro', '750cc', 800], ['CER208B', 'SCHWABEN BRAU Das Weizen x 500 c.c.', '500cc', 157.55], ['CER259E', 'PENON DEL AGUILA 2 Latas + Pinta', 'EST.x2', 416.98]]),
    source('cost', [['SAFE', 'Producto seguro', '750cc', 700], ['COST-ONLY', 'Producto solo costo', '500cc', 321.45]]),
  ];
  const result = plan(sources);
  const costOnly = result.products.find((item) => item.supplierSku === 'COST-ONLY')!;
  assert.equal(costOnly.eligibilityStatus, 'supplier_only_cost');
  assert.deepEqual(costOnly.prices.map((price) => price.priceType), ['cost']);
  assert.equal(costOnly.candidatePrices.length, 0);
  for (const sku of ['CER208B', 'CER259E']) {
    const product = result.products.find((item) => item.supplierSku === sku)!;
    assert.equal(product.eligibilityStatus, 'pending_review');
    assert.equal(product.prices.length, 0);
    assert.ok(product.candidatePrices.length > 0);
  }
  assert.match(formatSupplierDryRunReport(result.report), /SAFE=1 \(25%\).*PENDING=2 \(50%\).*COST_ONLY=1 \(25%\)/);
});

test('piso absoluto es configuracion del proveedor, no del core', () => {
  const defs = definitions(1); defs[0].absoluteMinimumPrice = 500;
  const result = plan([
    source('retail', [['LOW', 'Producto', '750cc', 100]]),
    source('wholesale', [['LOW', 'Producto', '750cc', 90]]),
    source('business', [['LOW', 'Producto', '750cc', 80]]),
    source('cost', [['LOW', 'Producto', '750cc', 70]]),
  ], availableSnapshot(), {}, defs);
  assert.ok(result.anomalies.some((item) => item.type === 'SUPPLIER_PRICE_BELOW_PROVIDER_FLOOR'));
});

test('750cc/750 cc/750 c.c./750c.c son equivalentes; formatos reales incompatibles se reportan', () => {
  assert.deepEqual(['750cc', '750 cc', '750 c.c.', '750c.c.'].map(normalizePresentation), ['750 ml', '750 ml', '750 ml', '750 ml']);
  const equivalent = plan(SUPPLIER_PRICE_TYPES.map((type, index) => source(type, [['SKU', 'Producto', ['750cc', '750 cc', '750 c.c.', '750c.c.'][index], 100 - index * 5]])));
  assert.equal(equivalent.report.global.inconsistentPresentations, 0);
  const incompatible = plan(SUPPLIER_PRICE_TYPES.map((type, index) => source(type, [['SKU', 'Producto', index === 3 ? '1 l' : '750cc', 100 - index * 5]])));
  assert.equal(incompatible.report.global.inconsistentPresentations, 1);
});

test('same SKU con metadata radical conserva canonica y guarda candidatos raw', () => {
  const existing = availableSnapshot([{ supplierSku: 'SKU', nameRaw: 'Vino Reserva', normalizedName: 'vino reserva', presentationRaw: '750cc', normalizedPresentation: '750 ml' }]);
  const result = plan(SUPPLIER_PRICE_TYPES.map((type) => source(type, [['SKU', 'Aceite Industrial', '5 l', 100]])), existing);
  assert.equal(result.products[0].updateCanonicalMetadata, false);
  assert.ok(result.products[0].rawData.observedCandidates);
  assert.ok(result.anomalies.some((item) => item.type === 'SUPPLIER_PRODUCT_METADATA_CONFLICT'));
});

test('fechas diferentes no bloquean y desfase extraordinario genera warning', () => {
  const dates = ['01/08/2026', '31/07/2026', '01/07/2026', '01/08/2026'];
  const result = plan(SUPPLIER_PRICE_TYPES.map((type, index) => source(type, [['SKU', 'Producto', '750cc', 100 - index * 5]], { emissionDate: dates[index] })));
  assert.equal(result.canApply, true);
  assert.ok(result.anomalies.some((item) => item.type === 'SOURCE_EMISSION_DATE_SPREAD'));
});

test('reporte incluye cobertura 4/4, nuevos/existentes/faltantes y cambios', () => {
  const snapshot = availableSnapshot([
    { supplierSku: 'SKU', nameRaw: 'Producto', normalizedName: 'producto', presentationRaw: '750cc', normalizedPresentation: '750 ml', prices: Object.fromEntries(SUPPLIER_PRICE_TYPES.map((type) => [type, 75])) },
    { supplierSku: 'MISSING', nameRaw: 'Falta', normalizedName: 'falta', presentationRaw: null, normalizedPresentation: null },
  ]);
  const result = plan(normalSources('SKU'), snapshot);
  assert.equal(result.report.global.presentIn4, 1);
  assert.equal(result.report.global.existingProducts, 1);
  assert.equal(result.report.global.missingProducts, 1);
  assert.equal(result.report.global.pricesChanging, 4);
});

test('paginacion explicita recupera mas de 1.000 productos sin mezclar scope', async () => {
  const source = Array.from({ length: 1_205 }, (_, id) => id);
  const calls: Array<[number, number]> = [];
  const result = await paginateRange(async (from, to) => { calls.push([from, to]); return source.slice(from, to + 1); }, 500);
  assert.equal(result.length, 1_205);
  assert.deepEqual(calls, [[0, 499], [500, 999], [1000, 1499]]);
});

test('migracion asegura atomicidad, permisos, metadata, fechas y stale lease', () => {
  const sql = readFileSync('db/migrations/012_supplier_price_sync.sql', 'utf8').toLowerCase();
  for (const contract of [
    'supplier_open_sync_run', 'heartbeat_at', 'stale_run_abandoned', 'pg_advisory_xact_lock',
    'security invoker', 'supplier_sync_blocked_plan', 'updatecanonicalmetadata',
    'normalized_presentation', 'source_emission_date', 'source_http_last_modified', 'fetched_at',
    'eligibility_status', "'safe', 'blocked', 'pending_review', 'supplier_only_cost'",
    'supplier_sync_non_promotable_product_has_current_prices', 'candidateprices',
    'delete from public.supplier_prices',
    'grant select on table public.tenants to service_role',
    'revoke all on function public.supplier_apply_sync(uuid, jsonb) from public, anon, authenticated',
    'grant execute on function public.supplier_apply_sync(uuid, jsonb) to service_role',
  ]) assert.equal(sql.includes(contract), true, contract);
  assert.equal(sql.includes("'partial_failure'"), false);
  assert.equal(sql.includes('lombardo'), false);
});

test('procedimiento Runia Dev bloquea identidad, migracion y writes fuera de secuencia', () => {
  const shell = readFileSync('scripts/suppliers/runia-dev-vinros.sh', 'utf8');
  for (const contract of [
    'RUNIA_DEV_SUPABASE_URL', 'RUNIA_DEV_SUPABASE_SECRET_KEY', 'RUNIA_DEV_PROJECT_REF',
    'RUNIA_DEV_DATABASE_URL', 'RUNIA_DEV_TENANT_SLUG', 'RUNIA_DEV_CONFIRM_ISOLATED',
    'RUNIA_DEV_ONLY:${RUNIA_DEV_PROJECT_REF}', 'RUNIA_PROTECTED_PROJECT_REFS',
    '--single-transaction', 'RUNIA_DEV_CONFIRM_MIGRATION', 'RUNIA_DEV_CONFIRM_HARNESS',
    'RUNIA_DEV_CONFIRM_FIRST_WRITE', 'RUNIA_DEV_CONFIRM_SECOND_WRITE',
    'require_empty_vinros_snapshot', 'require_populated_vinros_snapshot',
    'run_harness', 'run_dry_gate --expect-empty', 'run_dry_gate --expect-idempotent',
    'post_write_audit first', 'post_write_audit second',
  ]) assert.equal(shell.includes(contract), true, contract);
  assert.equal(shell.includes('NEXT_PUBLIC_SUPABASE'), false);

  const firstWrite = shell.slice(shell.indexOf('write-first)'), shell.indexOf('audit-first)'));
  assert.ok(firstWrite.indexOf('run_harness') < firstWrite.indexOf('run_dry_gate --expect-empty'));
  assert.ok(firstWrite.indexOf('run_dry_gate --expect-empty') < firstWrite.indexOf('run_write'));
  assert.ok(firstWrite.indexOf('run_write') < firstWrite.indexOf('post_write_audit first'));

  const gate = readFileSync('scripts/suppliers/runia-dev-expectations.ts', 'utf8');
  for (const expected of ['3_284', '3_281', '3_279', '3_875', '3_265', '611', '3_897']) {
    assert.equal(gate.includes(expected), true, expected);
  }
  assert.match(gate, /pricesChanging !== 0/);
});

function plan(sources: ParsedSupplierSource[], snapshot: SupplierSyncSnapshot = availableSnapshot(), guardrails = {}, defs = definitions(1)) {
  return planSupplierSync({ supplierCode: 'vinros', sources, sourceDefinitions: defs, snapshot, now: NOW, guardrails });
}
function normalSources(sku = 'SKU') {
  const prices = { retail: 100, wholesale: 90, business: 80, cost: 70 };
  return SUPPLIER_PRICE_TYPES.map((type) => source(type, [[sku, 'Producto estable', '750cc', prices[type]]]));
}
function source(priceType: SupplierPriceType, rows: Array<[string, string, string, unknown]>, options: { detectedList?: number; emissionDate?: string } = {}) {
  const expected = listNumber(priceType);
  return parseSupplierRows({
    priceType,
    expectedListNumber: expected,
    sourceUrl: `https://fixture.test/${priceType}`,
    contentFingerprint: `fingerprint-${priceType}`,
    sourceHttpLastModified: '2026-08-07T10:00:00.000Z',
    fetchedAt: NOW.toISOString(),
    rows: [
      [`Precio de Lista ${options.detectedList ?? expected}`],
      ['Fecha de Emisión', options.emissionDate ?? '01/08/2026'],
      ['Código', 'Denominación', 'Presentación', 'Precio c/IVA'],
      ...rows,
    ],
  });
}
function definitions(baseline: number | null = 1): SupplierSourceDefinition[] {
  return SUPPLIER_PRICE_TYPES.map((priceType) => ({ priceType, expectedListNumber: listNumber(priceType), url: `https://fixture.test/${priceType}`, approvedBaselineRows: baseline }));
}
function listNumber(type: SupplierPriceType): 1 | 2 | 3 | 4 { return ({ retail: 1, wholesale: 2, business: 3, cost: 4 } as const)[type]; }
function availableSnapshot(overrides: Array<Partial<SupplierSyncSnapshot['products'][number]> & { supplierSku: string }> = []): SupplierSyncSnapshot {
  return { available: true, products: overrides.map((item) => ({
    id: item.id ?? `id-${item.supplierSku}`, supplierSku: item.supplierSku, nameRaw: item.nameRaw ?? 'Producto estable', presentationRaw: item.presentationRaw ?? '750cc',
    normalizedName: item.normalizedName ?? 'producto estable', normalizedPresentation: item.normalizedPresentation ?? '750 ml', lastSeenAt: item.lastSeenAt ?? '2026-08-01T00:00:00Z',
    prices: item.prices ?? Object.fromEntries(SUPPLIER_PRICE_TYPES.map((type) => [type, 50])),
  })) };
}
function serviceInput(dryRun: boolean) { return { dryRun, tenantSlug: 'tenant-test', supplierCode: 'vinros', supplierName: 'VINROS', sources: definitions(1), guardrails: { minimumProductsPerList: 1 }, now: NOW }; }

class FixtureLoader implements SupplierSourceLoader {
  constructor(private readonly sources: ParsedSupplierSource[], private readonly fail?: SupplierPriceType) {}
  async load(definition: SupplierSourceDefinition) { if (definition.priceType === this.fail) throw new Error('fixture failure'); return this.sources.find((item) => item.priceType === definition.priceType)!; }
}
class FixtureSnapshotReader implements SupplierSnapshotReader { constructor(private readonly snapshot: SupplierSyncSnapshot) {} async loadSnapshot() { return this.snapshot; } }
class CountingWriter implements SupplierSyncWriter {
  opened = 0; applied = 0; failed = 0;
  async openRun(): Promise<SupplierRunHandle> { this.opened += 1; return { tenantId: 'tenant', supplierId: 'supplier', runId: 'run' }; }
  async applyRun(handle: SupplierRunHandle, plan: SupplierSyncPlan) { this.applied += 1; return { runId: handle.runId, supplierId: handle.supplierId, status: plan.status, productsRead: plan.productsRead, productsCreated: 0, pricesUpdated: 0, pricesUnchanged: 0, warnings: plan.warnings, errors: plan.errors, anomalies: plan.anomalies.length }; }
  async failRun() { this.failed += 1; }
}
