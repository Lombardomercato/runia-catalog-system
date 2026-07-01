import type { TenantResult } from './errors';
import type {
  TenantBranding,
  TenantExecutionContext,
  GetPublicTenantConfigInput,
  TenantPublicConfig,
  TenantResolutionInput,
  TenantSettings,
  UpdateTenantSettingsInput,
} from './interfaces';

export interface TenantService {
  getPublicConfigBySlug(
    input: GetPublicTenantConfigInput,
  ): Promise<TenantResult<TenantPublicConfig>>;
  resolve(input: TenantResolutionInput): Promise<TenantResult<TenantSettings>>;
  getSettings(context: TenantExecutionContext): Promise<TenantResult<TenantSettings>>;
  getBranding(context: TenantExecutionContext): Promise<TenantResult<TenantBranding>>;
  getPublicConfig(context: TenantExecutionContext): Promise<TenantResult<TenantPublicConfig>>;
  updateSettings(
    context: TenantExecutionContext,
    input: UpdateTenantSettingsInput,
  ): Promise<TenantResult<TenantSettings>>;
}
