import 'dotenv/config';

import type { SupplierAutomationTrigger } from '../../modules/suppliers/SupabaseSupplierAutomationRepository';
import { createVinrosAutomationRunner } from '../../modules/suppliers/vinros-automation';

const trigger = parseTrigger(process.env.VINROS_AUTOMATION_TRIGGER_SOURCE);

createVinrosAutomationRunner()
  .execute(trigger)
  .then((result) => {
    console.log(JSON.stringify({
      runId: result.runId,
      status: result.status,
      wrote: result.wrote,
      alertStatus: result.alertStatus,
      ...('supplierSyncRunId' in result
        ? { supplierSyncRunId: result.supplierSyncRunId }
        : {}),
      ...('products' in result ? { products: result.products } : {}),
      ...('productsCreated' in result
        ? { productsCreated: result.productsCreated }
        : {}),
      ...('pricesUpdated' in result
        ? { pricesUpdated: result.pricesUpdated }
        : {}),
      ...('pricesUnchanged' in result
        ? { pricesUnchanged: result.pricesUnchanged }
        : {}),
    }));
    if (result.status === 'blocked') process.exitCode = 2;
    if (result.status === 'failed') process.exitCode = 1;
  })
  .catch((error) => {
    console.error('VINROS_AUTOMATION_UNHANDLED', safeErrorCode(error));
    process.exitCode = 1;
  });

function parseTrigger(value: string | undefined): SupplierAutomationTrigger {
  return value === 'manual' || value === 'test' ? value : 'schedule';
}

function safeErrorCode(error: unknown) {
  if (!(error instanceof Error)) return 'UNKNOWN';
  return error.message.replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 120);
}
