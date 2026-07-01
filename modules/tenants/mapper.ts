import type { TenantCounts, TenantListItem, TenantRow, TenantStatus } from './types';

const DEFAULT_PRIMARY_COLOR = '#14b8a6';
const DEFAULT_SECONDARY_COLOR = '#0f172a';

export function mapTenantRowToListItem(row: TenantRow, counts: TenantCounts): TenantListItem {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: normalizeStatus(row.status),
    logoUrl: row.logo_url ?? null,
    primaryColor: row.primary_color ?? DEFAULT_PRIMARY_COLOR,
    secondaryColor: row.secondary_color ?? DEFAULT_SECONDARY_COLOR,
    createdAt: row.created_at,
    productsCount: counts.products,
    accountsCount: counts.accounts,
    salesCount: counts.sales,
  };
}

function normalizeStatus(value: string): TenantStatus {
  if (value === 'inactive' || value === 'archived') {
    return value;
  }

  return 'active';
}
