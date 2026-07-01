import { supabaseServer } from '@/lib/supabaseServer';
import { getTenantIdentity } from '@/modules/tenant/queries';
import { mapAccountRowToDetail, mapAccountRowToListItem } from './mapper';
import type {
  AccountDetailResult,
  AccountFiltersResult,
  AccountListParams,
  AccountListResult,
  AccountPaginationState,
  AccountPriceListOption,
  AccountQueryRow,
} from './types';

const ACCOUNT_SELECT = `
  id,
  name,
  legal_name,
  tax_id,
  whatsapp_phone,
  phone,
  email,
  address,
  price_list_id,
  discount_percent,
  credit_limit,
  commercial_terms,
  status,
  updated_at,
  price_lists:price_list_id(id, code, name)
`;

const EMPTY_PAGINATION: AccountPaginationState = {
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 1,
  hasPrevious: false,
  hasNext: false,
};

export async function listAccounts(
  tenantSlug: string,
  params: AccountListParams,
): Promise<AccountListResult> {
  const tenantResult = await getTenantIdentity(tenantSlug);

  if (tenantResult.error || !tenantResult.tenant) {
    return emptyAccountList(params, tenantResult.error);
  }

  let query = supabaseServer
    .from('customer_accounts')
    .select(ACCOUNT_SELECT, { count: 'exact' })
    .eq('tenant_id', tenantResult.tenant.id);

  if (params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  if (params.priceListId !== 'all') {
    query = query.eq('price_list_id', params.priceListId);
  }

  const search = normalizeSearchTerm(params.search);

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,legal_name.ilike.%${search}%,tax_id.ilike.%${search}%,email.ilike.%${search}%,whatsapp_phone.ilike.%${search}%,phone.ilike.%${search}%`,
    );
  }

  const start = (params.page - 1) * params.pageSize;
  const end = start + params.pageSize - 1;
  const { data, error, count } = await query
    .order('name', { ascending: true })
    .range(start, end);

  if (error) {
    return emptyAccountList(params, error.message);
  }

  const total = count ?? 0;

  return {
    accounts: ((data ?? []) as AccountQueryRow[]).map(mapAccountRowToListItem),
    pagination: buildPagination(total, params.page, params.pageSize),
    error: null,
  };
}

export async function getAccountById(
  tenantSlug: string,
  accountId: string,
): Promise<AccountDetailResult> {
  const tenantResult = await getTenantIdentity(tenantSlug);

  if (tenantResult.error || !tenantResult.tenant) {
    return {
      account: null,
      error: tenantResult.error,
    };
  }

  const { data, error } = await supabaseServer
    .from('customer_accounts')
    .select(ACCOUNT_SELECT)
    .eq('tenant_id', tenantResult.tenant.id)
    .eq('id', accountId)
    .single();

  if (error || !data) {
    return {
      account: null,
      error: 'No se encontro la account solicitada.',
    };
  }

  return {
    account: mapAccountRowToDetail(data as AccountQueryRow),
    error: null,
  };
}

export async function getAccountFilterOptions(tenantSlug: string): Promise<AccountFiltersResult> {
  const tenantResult = await getTenantIdentity(tenantSlug);

  if (tenantResult.error || !tenantResult.tenant) {
    return {
      priceLists: [],
      error: tenantResult.error,
    };
  }

  const priceLists = await getAccountPriceListsByTenantId(tenantResult.tenant.id);

  return {
    priceLists: priceLists.priceLists,
    error: priceLists.error,
  };
}

export async function countActiveAccountsByTenantId(tenantId: string) {
  const { count, error } = await supabaseServer
    .from('customer_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  return {
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

async function getAccountPriceListsByTenantId(tenantId: string): Promise<{
  priceLists: AccountPriceListOption[];
  error: string | null;
}> {
  const { data, error } = await supabaseServer
    .from('price_lists')
    .select('id, code, name, is_default')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    return {
      priceLists: [],
      error: error.message,
    };
  }

  return {
    priceLists: (data ?? []).map((priceList) => ({
      id: priceList.id,
      code: priceList.code,
      name: priceList.name,
      isDefault: priceList.is_default,
    })),
    error: null,
  };
}

function emptyAccountList(params: AccountListParams, error: string | null): AccountListResult {
  return {
    accounts: [],
    pagination: {
      ...EMPTY_PAGINATION,
      page: params.page,
      pageSize: params.pageSize,
    },
    error,
  };
}

function buildPagination(total: number, requestedPage: number, pageSize: number): AccountPaginationState {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), totalPages);

  return {
    page,
    pageSize,
    total,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

function normalizeSearchTerm(value: string) {
  return value.trim().replace(/[%,()_]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
}
