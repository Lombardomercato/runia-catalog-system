import 'dotenv/config';

import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeCatalogImportFromBuffer,
  previewCatalogImportFromBuffer,
} from '../../modules/imports/commands';
import { IMPORT_SHEETS, type ImportCommandResult, type ImportReport } from '../../modules/imports/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const args = new Set(process.argv.slice(2));
const isPreview = args.has('--dry-run') || args.has('--preview');
const tenantSlug = process.env.RB_TENANT_SLUG ?? 'rb-distribuidora';
const workbookPath = path.resolve(repoRoot, process.env.RB_CATALOG_XLSX ?? 'data/RB_CATALOGO_MASTER.xlsx');

async function main() {
  const buffer = new Uint8Array(readFileSync(workbookPath));
  const sourceFile = path.basename(workbookPath);
  const result = isPreview
    ? await previewCatalogImportFromBuffer(buffer, sourceFile, tenantSlug)
    : await executeCatalogImportFromBuffer(buffer, sourceFile, tenantSlug);
  const reportPath = result.report ? await saveReport(result.report) : null;
  printResult(result, reportPath);
  if (!result.ok) process.exitCode = 1;
}

async function saveReport(report: ImportReport) {
  const reportsDir = path.join(repoRoot, 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `import-rb-${formatTimestamp(new Date())}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return reportPath;
}

function printResult(result: ImportCommandResult, reportPath: string | null) {
  console.log(`\nImportacion RB (${isPreview ? 'dry-run' : 'import'})`);
  console.log(`Archivo: ${path.relative(repoRoot, workbookPath).replace(/\\/g, '/')}`);
  if (reportPath) console.log(`Reporte: ${path.relative(repoRoot, reportPath).replace(/\\/g, '/')}`);
  if (result.report) {
    console.table(Object.fromEntries(IMPORT_SHEETS.map((sheet) => [sheet, result.report?.stats[sheet]])));
    for (const error of result.report.errors) {
      console.log(`- ${error.sheet} fila ${error.rowNumber}, campo "${error.field}": ${error.error}. Valor: ${JSON.stringify(error.value)}`);
    }
  }
  if (result.message) console.log(`\n${result.message}`);
  if (result.error) console.error(`\n${result.error}`);
  if (result.warning) console.warn(`\n${result.warning}`);
}

function formatTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
