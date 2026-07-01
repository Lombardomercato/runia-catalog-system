export type AccountStatus = 'active' | 'inactive';

export interface Account {
  id: string;
  tenantId: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  priceListId: string | null;
  discountPercent: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AccountAuthenticationInput {
  identifier: string;
  password: string;
}

export interface AccountPrincipal {
  account: Account;
  authenticatedAt: string;
  expiresAt: string;
}

export interface AccountListQuery {
  search?: string;
  status?: AccountStatus;
  priceListId?: string;
  page?: number;
  pageSize?: number;
}

export interface AccountPage {
  items: Account[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AccountWriteInput {
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  priceListId: string | null;
  discountPercent: string;
  status: AccountStatus;
}
