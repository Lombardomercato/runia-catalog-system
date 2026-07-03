export type AccountStatus = 'active' | 'inactive' | 'pending' | 'blocked';

export type AccountStatusFilter = 'all' | AccountStatus;

export type AccountListParams = {
  search: string;
  status: AccountStatusFilter;
  priceListId: string;
  page: number;
  pageSize: number;
};

export type AccountPriceListOption = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
};

export type AccountListItem = {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  whatsapp: string | null;
  email: string | null;
  priceListId: string | null;
  priceListName: string | null;
  status: AccountStatus;
  isActive: boolean;
};

export type AccountPaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type AccountListResult = {
  accounts: AccountListItem[];
  pagination: AccountPaginationState;
  error: string | null;
};

export type AccountFiltersResult = {
  priceLists: AccountPriceListOption[];
  error: string | null;
};

export type AccountLinkOption = {
  id: string;
  name: string;
  legalName: string | null;
  whatsapp: string | null;
  email: string | null;
};

export type AccountLinkOptionsResult = {
  accounts: AccountLinkOption[];
  error: string | null;
};

export type AccountDetail = {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  priceListId: string | null;
  priceListName: string | null;
  discountPercent: number;
  status: AccountStatus;
  isActive: boolean;
  updatedAt: string;
  future: {
    contacts: Array<unknown>;
    addresses: Array<unknown>;
    creditLimit: number | null;
    commercialTerms: string | null;
  };
};

export type AccountDetailResult = {
  account: AccountDetail | null;
  error: string | null;
};

export type AccountCommandFieldErrors = Partial<
  Record<
    | 'tenantSlug'
    | 'accountId'
    | 'name'
    | 'legalName'
    | 'taxId'
    | 'whatsapp'
    | 'email'
    | 'address'
    | 'priceListId'
    | 'discountPercent'
    | 'isActive',
    string
  >
>;

export type AccountCommandResult = {
  ok: boolean;
  affected: number;
  message: string | null;
  error: string | null;
  fieldErrors: AccountCommandFieldErrors;
  updatedAt?: string;
  accountId?: string;
};

export type CreateAccountInput = {
  tenantSlug: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  priceListId: string | null;
  discountPercent: number | string | null;
  isActive: boolean;
};

export type CreateAccountFromSalesOrderSnapshotInput = CreateAccountInput & {
  sourceOrderId: string;
  notes: string | null;
};

export type UpdateAccountInput = CreateAccountInput & {
  accountId: string;
};

export type NormalizedAccountInput = {
  tenantSlug: string;
  accountId?: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  priceListId: string | null;
  discountPercent: number;
  isActive: boolean;
};

export type UpdateAccountPriceListInput = {
  tenantSlug: string;
  accountId: string;
  priceListId: string | null;
};

export type NormalizedUpdateAccountPriceListInput = UpdateAccountPriceListInput;

export type UpdateAccountStatusInput = {
  tenantSlug: string;
  accountId: string;
  isActive: boolean;
};

export type NormalizedUpdateAccountStatusInput = UpdateAccountStatusInput;

export type AccountRelation<T> = T | T[] | null;

export type AccountQueryRow = {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  whatsapp_phone: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  price_list_id: string | null;
  discount_percent: number | string | null;
  credit_limit?: number | string | null;
  commercial_terms?: string | null;
  status: string | null;
  updated_at?: string | null;
  price_lists: AccountRelation<{
    id: string;
    code: string | null;
    name: string | null;
  }>;
};
