import type { TenantExecutionContext } from '../tenant/interfaces';
import type { AccountsResult } from './errors';
import type {
  Account,
  AccountAuthenticationInput,
  AccountListQuery,
  AccountPage,
  AccountPrincipal,
  AccountStatus,
  AccountWriteInput,
} from './interfaces';

export interface AccountsService {
  authenticate(
    context: TenantExecutionContext,
    input: AccountAuthenticationInput,
  ): Promise<AccountsResult<AccountPrincipal>>;
  getById(context: TenantExecutionContext, id: string): Promise<AccountsResult<Account | null>>;
  list(
    context: TenantExecutionContext,
    query?: AccountListQuery,
  ): Promise<AccountsResult<AccountPage>>;
  create(
    context: TenantExecutionContext,
    input: AccountWriteInput,
  ): Promise<AccountsResult<Account>>;
  update(
    context: TenantExecutionContext,
    id: string,
    input: AccountWriteInput,
  ): Promise<AccountsResult<Account>>;
  setStatus(
    context: TenantExecutionContext,
    id: string,
    status: AccountStatus,
  ): Promise<AccountsResult<Account>>;
}
