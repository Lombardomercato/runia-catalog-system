export type TenantStatus = 'setup' | 'active' | 'inactive' | 'archived';

export type TenantListItem = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  createdAt: string;
  productsCount: number | null;
  accountsCount: number | null;
  salesCount: number | null;
};

export type TenantListResult = {
  tenants: TenantListItem[];
  error: string | null;
};

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  created_at: string;
};

export type TenantCounts = {
  products: number | null;
  accounts: number | null;
  sales: number | null;
};

export type TenantCountErrors = Partial<Record<keyof TenantCounts, string>>;

export type CreateTenantInput = {
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
};

export type NormalizedCreateTenantInput = CreateTenantInput;

export type TenantCommandFieldErrors = Partial<
  Record<'name' | 'slug' | 'primaryColor' | 'secondaryColor', string>
>;

export type TenantCommandResult = {
  ok: boolean;
  affected: number;
  message: string | null;
  error: string | null;
  fieldErrors: TenantCommandFieldErrors;
  tenantId?: string;
  tenantSlug?: string;
};
