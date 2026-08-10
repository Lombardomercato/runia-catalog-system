import 'dotenv/config';

import { formatSupplierDryRunReport } from '../../core/suppliers/report';
import type { SupplierDryRunReport, SupplierSyncResult } from '../../core/suppliers/types';
import { syncVinrosPrices } from '../../modules/suppliers/vinros';

const mode = process.argv[2];
if (mode !== '--dry-run' && mode !== '--write') throw new Error('Modo obligatorio: --dry-run o --write.');

syncVinrosPrices({ dryRun: mode === '--dry-run' })
  .then((result) => {
    const report = result.mode === 'dry-run' ? result as SupplierDryRunReport : (result as SupplierSyncResult).report;
    console.log(formatSupplierDryRunReport(report));
    if (result.mode === 'write') console.log(`\nRun persistido: ${(result as SupplierSyncResult).runId}`);
    if (!report.canWrite) process.exitCode = 2;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
