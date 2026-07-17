import 'server-only';

import type {
  CommerceTenantSetupRepository,
  PreparedCommerceTenantSetup,
} from '@/core/tenant/setup';
import { supabaseServer } from '@/lib/supabaseServer';
import { mapSetupRpcResult, mapSetupToRpcInput } from './mapper';

export class SupabaseCommerceTenantSetupRepository
  implements CommerceTenantSetupRepository {
  async createAtomically(input: PreparedCommerceTenantSetup) {
    const { data, error } = await supabaseServer.rpc('setup_create_commerce_tenant', {
      p_input: mapSetupToRpcInput(input),
    });
    if (error) throw new Error(error.message);
    const mapped = mapSetupRpcResult(data);
    if (!mapped) throw new Error('SETUP_RPC_INVALID_RESPONSE');
    return mapped;
  }
}
