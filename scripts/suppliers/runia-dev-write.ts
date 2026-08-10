import 'dotenv/config';

import { formatSupplierDryRunReport } from '../../core/suppliers/report';
import { syncVinrosPrices } from '../../modules/suppliers/vinros';
import { assertRuniaDevApprovedReport } from './runia-dev-expectations';

const expectation = process.argv[2];
if (expectation !== '--expect-empty' && expectation !== '--expect-idempotent') {
  throw new Error('Modo obligatorio: --expect-empty o --expect-idempotent.');
}
const snapshotExpectation = expectation === '--expect-empty' ? 'empty' : 'idempotent';

const result = await syncVinrosPrices({
  dryRun: false,
  beforeWrite: (plan) => assertRuniaDevApprovedReport(plan.report, snapshotExpectation),
});
if (result.mode !== 'write') throw new Error('INTERNAL_ERROR: el write controlado recibio un dry-run.');

console.log(formatSupplierDryRunReport(result.report));
console.log(`\nRUNIA DEV WRITE GATE: PASS (${snapshotExpectation})`);
console.log(`Run persistido: ${result.runId}`);
