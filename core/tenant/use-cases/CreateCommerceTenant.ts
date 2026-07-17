import {
  tenantSetupFailure,
  type CommerceTenantSetupInput,
  type CommerceTenantSetupRepository,
  type CreatedCommerceTenantSetup,
  type TenantSetupResult,
} from '../setup';
import { PrepareTenantDefaults } from './PrepareTenantDefaults';

export class CreateCommerceTenant {
  constructor(
    private readonly repository: CommerceTenantSetupRepository,
    private readonly prepareDefaults = new PrepareTenantDefaults(),
  ) {}

  async execute(
    input: CommerceTenantSetupInput,
  ): Promise<TenantSetupResult<CreatedCommerceTenantSetup>> {
    const prepared = this.prepareDefaults.execute(input);
    if (!prepared.ok) return prepared;

    try {
      const persisted = await this.repository.createAtomically(prepared.value);
      if (persisted.state === 'exists') {
        return tenantSetupFailure(
          'TENANT_ALREADY_EXISTS',
          `Ya existe un comercio con el slug "${prepared.value.slug}". No se creó ningún duplicado.`,
          { slug: 'El slug ya está en uso.' },
        );
      }
      return { ok: true, value: persisted.value };
    } catch {
      return tenantSetupFailure(
        'REPOSITORY_FAILURE',
        'No se pudo crear el comercio de forma transaccional.',
      );
    }
  }
}
