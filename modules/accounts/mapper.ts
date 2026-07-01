import type {
  AccountDetail,
  AccountListItem,
  AccountQueryRow,
  AccountRelation,
  AccountStatus,
} from './types';

const DEFAULT_STATUS: AccountStatus = 'active';

export function mapAccountRowToListItem(row: AccountQueryRow): AccountListItem {
  const priceList = firstRelation(row.price_lists);
  const status = normalizeStatus(row.status);

  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    taxId: row.tax_id,
    whatsapp: row.whatsapp_phone ?? row.phone,
    email: row.email,
    priceListId: row.price_list_id,
    priceListName: priceList?.name ?? null,
    status,
    isActive: status === 'active',
  };
}

export function mapAccountRowToDetail(row: AccountQueryRow): AccountDetail {
  const listItem = mapAccountRowToListItem(row);

  return {
    ...listItem,
    address: row.address,
    discountPercent: toNumber(row.discount_percent) ?? 0,
    updatedAt: row.updated_at ?? '',
    future: {
      contacts: [],
      addresses: [],
      creditLimit: toNumber(row.credit_limit),
      commercialTerms: row.commercial_terms ?? null,
    },
  };
}

export function firstRelation<T>(relation: AccountRelation<T>) {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation;
}

function normalizeStatus(value: string | null | undefined): AccountStatus {
  if (value === 'inactive' || value === 'pending' || value === 'blocked') {
    return value;
  }

  return DEFAULT_STATUS;
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}
