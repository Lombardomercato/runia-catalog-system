'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  applyBrandPricing,
  applyCostPlusToProducts,
  copyRetailToWholesale,
  recalculateBrandPrices,
  recalculatePriceList,
  updatePriceListRule,
  updatePricingBlock,
  updateProductPrices,
} from '@/modules/pricing/commands';
import type {
  PricingBrandOperation,
  PricingCommandResult,
  PricingListCode,
  PricingListParams,
  PricingListResult,
  PricingMode,
  PricingProduct,
  PricingRowInput,
} from '@/modules/pricing/types';
import { PRICING_PAGE_SIZE_OPTIONS } from '@/modules/pricing/validators';

type PricingClientProps = { tenantSlug: string; params: PricingListParams; result: PricingListResult };
type PriceDraft = {
  cost: string;
  costCurrency: string;
  minorista: string;
  mayorista: string;
  minoristaMode: PricingMode;
  mayoristaMode: PricingMode;
  minoristaMargin: string;
  mayoristaMargin: string;
};
type ListRuleDraft = { mode: PricingMode; margin: string };

const coverageOptions = [
  { value: 'all', label: 'Todos los productos' },
  { value: 'missing_mayorista', label: 'Sin precio Mayorista' },
  { value: 'missing_minorista', label: 'Sin precio Minorista' },
] as const;
const bulkAdjustments = [
  { value: '0', label: 'Mismo precio' },
  { value: '-10', label: '-10%' },
  { value: '-20', label: '-20%' },
  { value: '-30', label: '-30%' },
  { value: 'custom', label: 'Personalizado' },
] as const;
const brandOperations: Array<{ value: PricingBrandOperation; label: string }> = [
  { value: 'increase', label: 'Aumentar precios manuales' },
  { value: 'decrease', label: 'Reducir precios manuales' },
  { value: 'copy_retail_to_wholesale', label: 'Copiar Minorista a Mayorista' },
];

export function PricingClient({ tenantSlug, params, result }: PricingClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(params.search);
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>(() => toDrafts(result.products));
  const [listRules, setListRules] = useState<Record<PricingListCode, ListRuleDraft>>(() => toListRules(result));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [engineListCode, setEngineListCode] = useState<PricingListCode>('mayorista');
  const [engineBrandId, setEngineBrandId] = useState('');
  const [bulkAdjustment, setBulkAdjustment] = useState('-20');
  const [customAdjustment, setCustomAdjustment] = useState('-20');
  const [brandId, setBrandId] = useState('');
  const [brandOperation, setBrandOperation] = useState<PricingBrandOperation>('increase');
  const [brandPercentage, setBrandPercentage] = useState('10');
  const [commandResult, setCommandResult] = useState<PricingCommandResult | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isNavigating, startNavigation] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const minoristaList = result.priceLists.find((list) => list.code === 'minorista') ?? null;
  const mayoristaList = result.priceLists.find((list) => list.code === 'mayorista') ?? null;
  const visibleIds = result.products.map((product) => product.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const updateParams = useCallback((changes: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([key, value]) => {
      if (!value || value === 'all') next.delete(key);
      else next.set(key, value);
    });
    if (resetPage) next.delete('page');
    const queryString = next.toString();
    startNavigation(() => router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false }));
  }, [pathname, router, searchParams]);

  useEffect(() => setQuery(params.search), [params.search]);
  useEffect(() => { setDrafts(toDrafts(result.products)); setSelectedIds(new Set()); }, [result.products]);
  useEffect(() => setListRules(toListRules(result)), [result.priceLists]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query !== params.search) updateParams({ q: query.trim() || null });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [params.search, query, updateParams]);

  function updateDraft(productId: string, field: keyof PriceDraft, value: string) {
    setCommandResult(null);
    setDrafts((current) => ({ ...current, [productId]: { ...current[productId], [field]: value } }));
  }

  function updateMode(productId: string, field: 'minoristaMode' | 'mayoristaMode', value: PricingMode) {
    setCommandResult(null);
    setDrafts((current) => ({ ...current, [productId]: { ...current[productId], [field]: value } }));
  }

  function toggleProduct(productId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return next;
    });
  }

  function toggleVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id)); else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function saveRow(product: PricingProduct) {
    const draft = drafts[product.id];
    if (!draft) return;
    runCommand(`row:${product.id}`, () => updateProductPrices({ tenantSlug, ...toRowInput(product.id, draft) }));
  }

  function saveSelected() {
    const rows = selectedProducts(result.products, selectedIds).map((product) => toRowInput(product.id, drafts[product.id]));
    if (!rows.length || !window.confirm(`Guardar costo, reglas y precios de ${rows.length} productos?`)) return;
    runCommand('block', () => updatePricingBlock({ tenantSlug, rows }), true);
  }

  function saveListRule(code: PricingListCode) {
    const rule = listRules[code];
    runCommand(`rule:${code}`, () => updatePriceListRule({ tenantSlug, priceListCode: code, pricingMode: rule.mode, marginPercent: rule.margin }));
  }

  function recalculateList() {
    if (!window.confirm(`Recalcular todos los precios ${labelList(engineListCode)} que esten en modo Costo + margen?`)) return;
    runCommand('recalculate-list', () => recalculatePriceList({ tenantSlug, priceListCode: engineListCode }));
  }

  function applyCostPlus() {
    const productIds = [...selectedIds];
    if (!productIds.length || !window.confirm(`Convertir ${productIds.length} precios ${labelList(engineListCode)} a Costo + margen?`)) return;
    runCommand('cost-plus', () => applyCostPlusToProducts({ tenantSlug, priceListCode: engineListCode, productIds }), true);
  }

  function recalculateBrand() {
    const brand = result.brands.find((item) => item.id === engineBrandId);
    if (!brand || !window.confirm(`Recalcular ${labelList(engineListCode)} para los precios calculados de ${brand.name}?`)) return;
    runCommand('recalculate-brand', () => recalculateBrandPrices({ tenantSlug, priceListCode: engineListCode, brandId: brand.id }));
  }

  function copySelected() {
    const productIds = [...selectedIds];
    const adjustment = bulkAdjustment === 'custom' ? customAdjustment : bulkAdjustment;
    if (!productIds.length || !window.confirm(`Copiar Minorista a Mayorista para ${productIds.length} productos con ajuste ${adjustment}%?`)) return;
    runCommand('copy', () => copyRetailToWholesale({ tenantSlug, productIds, adjustmentPercent: adjustment }), true);
  }

  function applyBrandAction() {
    const brand = result.brands.find((item) => item.id === brandId);
    if (!brand || !window.confirm(`Aplicar operacion manual a ${brand.name} con ${brandPercentage}%?`)) return;
    runCommand('brand', () => applyBrandPricing({ tenantSlug, brandId, operation: brandOperation, percentage: brandPercentage }));
  }

  function runCommand(key: string, command: () => Promise<PricingCommandResult>, clearSelection = false) {
    setSavingKey(key);
    setCommandResult(null);
    startSaving(async () => {
      const response = await command();
      setCommandResult(response);
      setSavingKey(null);
      if (response.ok) {
        if (clearSelection) setSelectedIds(new Set());
        router.refresh();
      }
    });
  }

  const selectedCount = selectedIds.size;
  const formatMoney = useMemo(() => createMoneyFormatter(result.currency), [result.currency]);

  return (
    <main className="pricing-page">
      <header className="admin-header pricing-header">
        <p className="admin-kicker">Motor comercial</p>
        <div className="admin-header-row"><div><h1 className="admin-title">Pricing Engine</h1><p className="admin-subtitle">Costo, reglas y precio final por lista.</p></div><span className="admin-status">{result.pagination.total} productos</span></div>
      </header>

      <section className="pricing-summary" aria-label="Cobertura de precios">
        <Summary label="Productos" value={result.summary.products} />
        <Summary alert={result.summary.missingCost > 0} label="Sin costo" value={result.summary.missingCost} />
        <Summary alert={result.summary.missingMinorista > 0} label="Sin Minorista" value={result.summary.missingMinorista} />
        <Summary alert={result.summary.missingMayorista > 0} label="Sin Mayorista" value={result.summary.missingMayorista} />
      </section>

      {!result.error ? <section className="pricing-rule-grid" aria-label="Reglas por lista">
        {result.priceLists.map((list) => {
          const draft = listRules[list.code];
          return <article className="pricing-rule" key={list.id}><div><span>Regla de lista</span><strong>{list.name}</strong></div><label><span>Modo por defecto</span><select onChange={(event) => setListRules((current) => ({ ...current, [list.code]: { ...current[list.code], mode: event.target.value as PricingMode } }))} value={draft.mode}><option value="manual">Manual</option><option value="cost_plus_percent">Costo + margen</option></select></label><label><span>Margen %</span><input max="500" min="-100" onChange={(event) => setListRules((current) => ({ ...current, [list.code]: { ...current[list.code], margin: event.target.value } }))} step="0.01" type="number" value={draft.margin} /></label><button className="products-muted-button" disabled={isSaving} onClick={() => saveListRule(list.code)} type="button">{savingKey === `rule:${list.code}` ? 'Guardando' : 'Guardar regla'}</button></article>;
        })}
      </section> : null}

      <section className="products-toolbar" aria-label="Filtros de precios">
        <label className="products-search"><span>Buscar</span><input autoComplete="off" onChange={(event) => setQuery(event.target.value)} placeholder="SKU, producto o marca" type="search" value={query} /></label>
        <div className="pricing-filter-grid"><FilterSelect label="Marca" onChange={(value) => updateParams({ brand: value })} options={result.brands} value={params.brandId} /><FilterSelect label="Categoria" onChange={(value) => updateParams({ category: value })} options={result.categories} value={params.categoryId} /><label className="products-control"><span>Cobertura</span><select onChange={(event) => updateParams({ coverage: event.target.value })} value={params.coverage}>{coverageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="products-control"><span>Pagina</span><select onChange={(event) => updateParams({ pageSize: event.target.value })} value={String(params.pageSize)}>{PRICING_PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} filas</option>)}</select></label></div>
      </section>

      <section className="pricing-operations" aria-label="Operaciones del motor">
        <div className="pricing-operation-panel pricing-engine-panel"><div><span>Seleccionados</span><strong>{selectedCount}</strong></div><label><span>Lista</span><select onChange={(event) => setEngineListCode(event.target.value as PricingListCode)} value={engineListCode}><option value="minorista">Minorista</option><option value="mayorista">Mayorista</option></select></label><button className="products-action-button" disabled={!selectedCount || isSaving} onClick={applyCostPlus} type="button">Aplicar costo + margen</button><button className="products-muted-button" disabled={isSaving} onClick={recalculateList} type="button">Recalcular lista</button></div>
        <div className="pricing-operation-panel"><label><span>Marca</span><select onChange={(event) => setEngineBrandId(event.target.value)} value={engineBrandId}><option value="">Seleccionar</option>{result.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><button className="products-muted-button" disabled={!engineBrandId || isSaving} onClick={recalculateBrand} type="button">Recalcular marca</button><button className="products-muted-button" disabled={!selectedCount || isSaving} onClick={saveSelected} type="button">Guardar seleccionados</button></div>
      </section>

      <details className="pricing-legacy-actions"><summary>Operaciones manuales</summary><div className="pricing-operations"><div className="pricing-operation-panel"><label><span>Ajuste Mayorista</span><select onChange={(event) => setBulkAdjustment(event.target.value)} value={bulkAdjustment}>{bulkAdjustments.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{bulkAdjustment === 'custom' ? <label><span>Ajuste %</span><input max="500" min="-100" onChange={(event) => setCustomAdjustment(event.target.value)} type="number" value={customAdjustment} /></label> : null}<button className="products-muted-button" disabled={!selectedCount || isSaving} onClick={copySelected} type="button">Copiar Minorista</button></div><div className="pricing-operation-panel"><label><span>Marca</span><select onChange={(event) => setBrandId(event.target.value)} value={brandId}><option value="">Seleccionar</option>{result.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><label><span>Operacion</span><select onChange={(event) => setBrandOperation(event.target.value as PricingBrandOperation)} value={brandOperation}>{brandOperations.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>%</span><input max="500" min="-100" onChange={(event) => setBrandPercentage(event.target.value)} type="number" value={brandPercentage} /></label><button className="products-muted-button" disabled={!brandId || isSaving} onClick={applyBrandAction} type="button">Aplicar</button></div></div></details>

      {isNavigating ? <div className="products-loading-pill">Actualizando vista</div> : null}
      {result.error ? <section className="products-state products-state-error"><strong>No se pudieron cargar los precios.</strong><p>{result.error}</p></section> : null}
      {commandResult?.error ? <section className="product-edit-feedback product-edit-feedback-error" role="alert">{commandResult.error}<FieldErrors errors={commandResult.fieldErrors} /></section> : null}
      {commandResult?.ok ? <section className="product-edit-feedback product-edit-feedback-success" role="status">{commandResult.message}</section> : null}
      {commandResult?.warning ? <section className="pricing-warning" role="status">{commandResult.warning}</section> : null}
      {!result.error && result.products.length === 0 ? <section className="products-state"><strong>No hay productos para estos filtros.</strong></section> : null}

      {!result.error && result.products.length > 0 ? <section className="pricing-list" aria-label="Listado de precios">
        <div className="pricing-list-head"><span><input aria-label="Seleccionar productos visibles" checked={allVisibleSelected} onChange={toggleVisible} type="checkbox" /></span><span>SKU / Producto</span><span>Marca</span><span>Categoria</span><span>Costo</span><span>Minorista</span><span>Margen Minorista</span><span>Mayorista</span><span>Margen Mayorista</span><span>Accion</span></div>
        {result.products.map((product) => {
          const draft = drafts[product.id] ?? emptyDraft(result.currency);
          return <article className="pricing-row" key={product.id}><label className="products-check-label"><input checked={selectedIds.has(product.id)} onChange={() => toggleProduct(product.id)} type="checkbox" /><span className="sr-only">Seleccionar {product.name}</span></label><div className="pricing-product"><span>{product.sku}</span><strong>{product.name}</strong><small>{product.variant || 'Sin variante'} · {product.isActive ? 'Activo' : 'Inactivo'}</small></div><div className="pricing-taxonomy"><strong>{product.brandName}</strong></div><div className="pricing-taxonomy"><span>{product.categoryName}</span></div><PriceInput active error={commandResult?.fieldErrors[`${product.id}.cost`]} label={draft.costCurrency} onChange={(value) => updateDraft(product.id, 'cost', value)} value={draft.cost} /><PriceInput active={minoristaList?.isActive === true} disabled={draft.minoristaMode === 'cost_plus_percent'} error={commandResult?.fieldErrors[`${product.id}.minoristaPrice`]} label="Precio" onChange={(value) => updateDraft(product.id, 'minorista', value)} value={draft.minorista} /><MarginEditor active={minoristaList?.isActive === true} defaultMargin={minoristaList?.marginPercent ?? 0} margin={draft.minoristaMargin} mode={draft.minoristaMode} onMarginChange={(value) => updateDraft(product.id, 'minoristaMargin', value)} onModeChange={(value) => updateMode(product.id, 'minoristaMode', value)} /><PriceInput active={mayoristaList?.isActive === true} disabled={draft.mayoristaMode === 'cost_plus_percent'} error={commandResult?.fieldErrors[`${product.id}.mayoristaPrice`]} label="Precio" onChange={(value) => updateDraft(product.id, 'mayorista', value)} value={draft.mayorista} /><MarginEditor active={mayoristaList?.isActive === true} defaultMargin={mayoristaList?.marginPercent ?? 0} margin={draft.mayoristaMargin} mode={draft.mayoristaMode} onMarginChange={(value) => updateDraft(product.id, 'mayoristaMargin', value)} onModeChange={(value) => updateMode(product.id, 'mayoristaMode', value)} /><button className="products-muted-button pricing-save-row" disabled={isSaving} onClick={() => saveRow(product)} type="button">{savingKey === `row:${product.id}` ? 'Guardando' : 'Guardar'}</button></article>;
        })}
      </section> : null}

      <footer className="products-pagination"><span>Pagina {result.pagination.page} de {result.pagination.totalPages}</span><div><button disabled={!result.pagination.hasPrevious || isNavigating} onClick={() => updateParams({ page: String(result.pagination.page - 1) }, false)} type="button">Anterior</button><button disabled={!result.pagination.hasNext || isNavigating} onClick={() => updateParams({ page: String(result.pagination.page + 1) }, false)} type="button">Siguiente</button></div></footer>
      <p className="pricing-currency">Moneda: {result.currency}. Referencia: {formatMoney.format(0)}.</p>
    </main>
  );
}

function Summary({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) { return <div data-alert={alert}><span>{label}</span><strong>{value}</strong></div>; }
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; name: string }>; onChange: (value: string) => void }) { return <label className="products-control"><span>{label}</span><select onChange={(event) => onChange(event.target.value)} value={value}><option value="all">Todas</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>; }
function PriceInput({ label, value, active, disabled = false, error, onChange }: { label: string; value: string; active: boolean; disabled?: boolean; error?: string; onChange: (value: string) => void }) { return <label className="pricing-price-input"><span>{label}</span><input aria-invalid={Boolean(error)} disabled={!active || disabled} min="0" onChange={(event) => onChange(event.target.value)} placeholder={!active ? 'Lista inactiva' : disabled ? 'Calculado' : '0,00'} required={active && !disabled} step="0.01" type="number" value={value} />{error ? <small>{error}</small> : null}</label>; }
function MarginEditor({ active, mode, margin, defaultMargin, onModeChange, onMarginChange }: { active: boolean; mode: PricingMode; margin: string; defaultMargin: number; onModeChange: (value: PricingMode) => void; onMarginChange: (value: string) => void }) { return <div className="pricing-margin-editor"><select aria-label="Modo de precio" disabled={!active} onChange={(event) => onModeChange(event.target.value as PricingMode)} value={mode}><option value="manual">Manual</option><option value="cost_plus_percent">Costo + margen</option></select><label><span>{mode === 'cost_plus_percent' ? `Override · base ${defaultMargin}%` : 'Sin margen'}</span><input disabled={!active || mode === 'manual'} max="500" min="-100" onChange={(event) => onMarginChange(event.target.value)} placeholder={String(defaultMargin)} step="0.01" type="number" value={margin} /></label></div>; }
function FieldErrors({ errors }: { errors: Record<string, string> }) { const values = [...new Set(Object.values(errors))]; return values.length ? <ul className="pricing-field-errors">{values.map((error) => <li key={error}>{error}</li>)}</ul> : null; }

function toDrafts(products: PricingProduct[]) { return Object.fromEntries(products.map((product) => [product.id, { cost: formatInputNumber(product.cost), costCurrency: product.costCurrency, minorista: formatInputNumber(product.minoristaPrice), mayorista: formatInputNumber(product.mayoristaPrice), minoristaMode: product.minoristaPricingMode, mayoristaMode: product.mayoristaPricingMode, minoristaMargin: formatInputNumber(product.minoristaMarginOverride), mayoristaMargin: formatInputNumber(product.mayoristaMarginOverride) }])); }
function toListRules(result: PricingListResult): Record<PricingListCode, ListRuleDraft> { return { minorista: listRule(result, 'minorista'), mayorista: listRule(result, 'mayorista') }; }
function listRule(result: PricingListResult, code: PricingListCode) { const list = result.priceLists.find((item) => item.code === code); return { mode: list?.pricingMode ?? 'manual', margin: String(list?.marginPercent ?? 0) } satisfies ListRuleDraft; }
function toRowInput(productId: string, draft: PriceDraft | undefined): PricingRowInput { const value = draft ?? emptyDraft('ARS'); return { productId, cost: value.cost, costCurrency: value.costCurrency, minoristaPrice: value.minorista, mayoristaPrice: value.mayorista, minoristaPricingMode: value.minoristaMode, mayoristaPricingMode: value.mayoristaMode, minoristaMarginOverride: value.minoristaMargin, mayoristaMarginOverride: value.mayoristaMargin }; }
function emptyDraft(currency: string): PriceDraft { return { cost: '0', costCurrency: currency, minorista: '', mayorista: '', minoristaMode: 'manual', mayoristaMode: 'manual', minoristaMargin: '', mayoristaMargin: '' }; }
function formatInputNumber(value: number | null) { return value === null ? '' : String(value); }
function selectedProducts(products: PricingProduct[], selectedIds: Set<string>) { return products.filter((product) => selectedIds.has(product.id)); }
function createMoneyFormatter(currency: string) { return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 2 }); }
function labelList(code: PricingListCode) { return code === 'minorista' ? 'Minorista' : 'Mayorista'; }
