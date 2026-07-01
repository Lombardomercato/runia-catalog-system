'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { confirmCatalogImport, previewCatalogImport } from '@/modules/imports/commands';
import {
  IMPORT_SHEETS,
  type ImportCommandResult,
  type ImportHistoryResult,
  type ImportReport,
  type ImportSheetName,
} from '@/modules/imports/types';

type ImportCatalogClientProps = {
  tenantSlug: string;
  history: ImportHistoryResult;
};

export function ImportCatalogClient({ tenantSlug, history }: ImportCatalogClientProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportCommandResult | null>(null);
  const [action, setAction] = useState<'preview' | 'import' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();

  function selectFile(nextFile: File | null) {
    setFile(nextFile);
    setResult(null);
  }

  function runPreview() {
    if (!file) return;
    setAction('preview');
    startTransition(async () => {
      try {
        setResult(await previewCatalogImport(toFormData(file)));
      } catch {
        setResult(clientFailure('No se pudo validar el archivo. Reintenta la operacion.'));
      } finally {
        setAction(null);
      }
    });
  }

  function runImport() {
    if (!file || !result?.ok || result.stage !== 'preview') return;
    if (!window.confirm(`Importar ${file.name} en ${tenantSlug}? Esta operacion escribira datos en Supabase.`)) return;
    setAction('import');
    startTransition(async () => {
      try {
        const response = await confirmCatalogImport(toFormData(file));
        setResult(response);
        if (response.ok) router.refresh();
      } catch {
        setResult(clientFailure('La importacion no pudo completarse. Revisa la conexion y vuelve a validar.'));
      } finally {
        setAction(null);
      }
    });
  }

  const canImport = Boolean(file && result?.ok && result.stage === 'preview' && !isPending);

  return (
    <main className="imports-page">
      <header className="admin-header imports-header">
        <p className="admin-kicker">Operaciones de catalogo</p>
        <div className="admin-header-row">
          <div>
            <h1 className="admin-title">Importador</h1>
            <p className="admin-subtitle">Validacion y carga controlada desde XLSX.</p>
          </div>
          <span className="admin-status">{tenantSlug}</span>
        </div>
      </header>

      <section className="imports-workflow" aria-label="Flujo de importacion">
        <div className="imports-step" data-active={!result}><span>1</span><strong>Archivo</strong></div>
        <div className="imports-step" data-active={result?.stage === 'preview'}><span>2</span><strong>Preview</strong></div>
        <div className="imports-step" data-active={result?.stage === 'completed'}><span>3</span><strong>Resultado</strong></div>
      </section>

      <section className="imports-upload-panel">
        <div
          className="imports-dropzone"
          data-dragging={isDragging}
          onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            selectFile(event.dataTransfer.files[0] ?? null);
          }}
        >
          <input
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            ref={inputRef}
            type="file"
          />
          <div>
            <span className="imports-file-mark">XLSX</span>
            <strong>{file?.name ?? 'Seleccionar archivo de catalogo'}</strong>
            <small>{file ? formatFileSize(file.size) : 'Maximo 4 MB'}</small>
          </div>
          <button className="products-muted-button" onClick={() => inputRef.current?.click()} type="button">
            Elegir archivo
          </button>
        </div>
        <div className="imports-upload-actions">
          <p>{file ? 'El preview no modifica datos.' : 'Selecciona el archivo exportado desde el Sheet maestro.'}</p>
          <button className="products-action-button" disabled={!file || isPending} onClick={runPreview} type="button">
            {action === 'preview' ? 'Validando...' : 'Validar archivo'}
          </button>
        </div>
      </section>

      {result?.error ? <section className="product-edit-feedback product-edit-feedback-error" role="alert">{result.error}</section> : null}
      {result?.message ? <section className="product-edit-feedback product-edit-feedback-success" role="status">{result.message}</section> : null}
      {result?.warning ? <section className="pricing-warning" role="status">{result.warning}</section> : null}

      {result?.report ? (
        <ImportPreview
          canImport={canImport}
          importing={action === 'import'}
          onImport={runImport}
          report={result.report}
        />
      ) : null}

      <ImportHistory history={history} />
    </main>
  );
}

function ImportPreview({ report, canImport, importing, onImport }: { report: ImportReport; canImport: boolean; importing: boolean; onImport: () => void }) {
  const totals = reportTotals(report);
  return (
    <section className="imports-preview">
      <div className="imports-section-heading">
        <div><p className="admin-kicker">Resultado de validacion</p><h2>{report.blocked ? 'Requiere correcciones' : report.mode === 'import' ? 'Importacion finalizada' : 'Listo para importar'}</h2></div>
        <div className="imports-total"><span>Filas validas</span><strong>{totals.valid}/{totals.read}</strong></div>
      </div>

      <div className="imports-stats-grid">
        {IMPORT_SHEETS.map((sheet) => <SheetStatsCard key={sheet} report={report} sheet={sheet} />)}
      </div>

      {report.errors.length ? <ImportErrors report={report} /> : null}
      {report.fatalError ? <div className="imports-fatal-error">{report.fatalError}</div> : null}

      <div className="imports-confirm-bar" data-ready={!report.blocked}>
        <div><span>{report.blocked ? 'Importacion bloqueada' : report.mode === 'import' ? 'Proceso completado' : 'Sin errores criticos'}</span><strong>{totals.create} altas · {totals.update} actualizaciones</strong></div>
        {report.mode === 'preview' ? <button className="products-action-button" disabled={!canImport} onClick={onImport} type="button">{importing ? 'Importando...' : 'Confirmar importacion'}</button> : null}
      </div>
    </section>
  );
}

function SheetStatsCard({ report, sheet }: { report: ImportReport; sheet: ImportSheetName }) {
  const stats = report.stats[sheet];
  return <article className="imports-stat-card" data-errors={stats.errors > 0}><div><span>{sheet}</span><strong>{stats.rowsValid}/{stats.rowsRead}</strong></div><dl><div><dt>Errores</dt><dd>{stats.errors}</dd></div><div><dt>Altas</dt><dd>{stats.toCreate}</dd></div><div><dt>Actualiza</dt><dd>{stats.toUpdate}</dd></div></dl></article>;
}

function ImportErrors({ report }: { report: ImportReport }) {
  return <section className="imports-errors" aria-label="Errores de validacion"><div className="imports-section-heading"><div><p className="admin-kicker">Errores</p><h2>{report.errors.length} problemas encontrados</h2></div></div><div className="imports-error-head"><span>Hoja / fila</span><span>Campo</span><span>Error</span><span>Valor recibido</span></div>{report.errors.map((item, index) => <article className="imports-error-row" key={`${item.sheet}-${item.rowNumber}-${item.field}-${index}`}><div><strong>{item.sheet}</strong><span>Fila {item.rowNumber}</span></div><code>{item.field}</code><p>{item.error}</p><code>{formatReceivedValue(item.value)}</code></article>)}</section>;
}

function ImportHistory({ history }: { history: ImportHistoryResult }) {
  return <section className="imports-history"><div className="imports-section-heading"><div><p className="admin-kicker">Actividad</p><h2>Importaciones recientes</h2></div></div>{history.error ? <div className="products-state products-state-error"><p>{history.error}</p></div> : null}{!history.error && !history.imports.length ? <div className="products-state"><strong>Todavia no hay importaciones.</strong></div> : null}{history.imports.length ? <div className="imports-history-list">{history.imports.map((item) => <article className="imports-history-row" key={item.id}><div><strong>{item.sourceName}</strong><span>{formatDateTime(item.startedAt ?? item.createdAt)}</span></div><span className="imports-status" data-status={item.status}>{statusLabel(item.status)}</span><div><strong>{item.totalRows}</strong><span>filas</span></div><div><strong>{item.toCreate}</strong><span>altas</span></div><div><strong>{item.toUpdate}</strong><span>actualiza</span></div></article>)}</div> : null}</section>;
}

function toFormData(file: File) { const formData = new FormData(); formData.set('file', file); return formData; }
function reportTotals(report: ImportReport) { return IMPORT_SHEETS.reduce((totals, sheet) => { const stats = report.stats[sheet]; totals.read += stats.rowsRead; totals.valid += stats.rowsValid; totals.create += stats.toCreate; totals.update += stats.toUpdate; return totals; }, { read: 0, valid: 0, create: 0, update: 0 }); }
function formatFileSize(bytes: number) { const megabytes = bytes >= 1024 * 1024; return `${(bytes / (megabytes ? 1024 * 1024 : 1024)).toFixed(megabytes ? 1 : 0)} ${megabytes ? 'MB' : 'KB'}`; }
function formatReceivedValue(value: string | number | boolean | null) { return value === null ? 'vacio' : String(value); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function statusLabel(status: string) { return ({ completed: 'Completada', failed: 'Fallida', processing: 'Procesando', pending: 'Pendiente', completed_with_errors: 'Con errores' } as Record<string, string>)[status] ?? status; }
function clientFailure(error: string): ImportCommandResult { return { ok: false, stage: 'failed', report: null, batchId: null, message: null, error, warning: null }; }
