import 'dotenv/config';

import { formatSupplierDryRunReport } from '../../core/suppliers/report';
import { syncVinrosPrices } from '../../modules/suppliers/vinros';
import { runiaDevReportDifferences } from './runia-dev-expectations';

const expectation = process.argv[2];
if (expectation !== '--expect-empty' && expectation !== '--expect-idempotent') {
  throw new Error('Modo obligatorio: --expect-empty o --expect-idempotent.');
}

const result = await syncVinrosPrices({ dryRun: true });
if (result.mode !== 'dry-run') throw new Error('INTERNAL_ERROR: el gate recibio un resultado write.');
const report = result;
console.log(formatSupplierDryRunReport(report));

const snapshotExpectation = expectation === '--expect-empty' ? 'empty' : 'idempotent';
const differences = runiaDevReportDifferences(report, snapshotExpectation);

if (differences.length > 0) {
  console.error('\nRUNIA DEV DRY GATE: FAIL');
  for (const difference of differences) console.error(`- ${difference}`);
  console.error('Las hojas o el snapshot difieren del dry-run aprobado. WRITE ABORTADO.');
  process.exitCode = 2;
} else {
  console.log(`\nRUNIA DEV DRY GATE: PASS (${expectation.slice(2)})`);
  console.log('WRITES REALIZADOS POR ESTE DRY-RUN = 0');
}
