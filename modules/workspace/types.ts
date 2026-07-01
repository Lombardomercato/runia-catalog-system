export type WorkspaceTenant = {
  id: string;
  slug: string;
  name: string;
};

export type WorkspaceCountKey =
  | 'products'
  | 'accounts'
  | 'sales'
  | 'categories'
  | 'brands';

export type WorkspacePendingKey =
  | 'salesDraft'
  | 'salesPending'
  | 'productsWithoutPrice'
  | 'accountsWithoutPriceList';

export type WorkspaceMetric = {
  key: WorkspaceCountKey | WorkspacePendingKey;
  label: string;
  value: number | null;
  description: string;
  href: string;
  error: string | null;
};

export type WorkspaceActivity = {
  id: string;
  label: string;
  description: string;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  createdAt: string;
  href: string | null;
};

export type WorkspaceSidebarIndicators = {
  products: number | null;
  accounts: number | null;
  sales: number | null;
};

export type CommercialWorkspace = {
  tenant: WorkspaceTenant | null;
  summary: WorkspaceMetric[];
  pending: WorkspaceMetric[];
  activity: WorkspaceActivity[];
  activityError: string | null;
  sidebarIndicators: WorkspaceSidebarIndicators;
  errors: string[];
};

export type CountResult = {
  count: number | null;
  error: string | null;
};

export type AuditLogRow = {
  id: string;
  actor_name: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};
