export type WorkspaceTenant = {
  id: string;
  slug: string;
  name: string;
  currency: string;
};

export type WorkspaceMetricKey =
  | 'salesPending'
  | 'salesConfirmed'
  | 'salesPreparing'
  | 'totalSales'
  | 'averageTicket'
  | 'ordersToday'
  | 'ordersLast7Days'
  | 'pendingConfirmation'
  | 'pendingPreparing'
  | 'deliveredNotClosed';

export type WorkspaceMetric = {
  key: WorkspaceMetricKey;
  label: string;
  value: number | null;
  description: string;
  href: string;
  error: string | null;
  format: 'count' | 'currency';
};

export type WorkspaceRecentOrder = {
  id: string;
  customerName: string;
  total: number;
  currency: string;
  status: string;
  createdAt: string;
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
  recentOrders: WorkspaceRecentOrder[];
  recentOrdersError: string | null;
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
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
};

export type WorkspaceSalesRow = {
  id: string;
  status: string;
  total: number | string | null;
  currency: string | null;
  created_at: string;
};

export type WorkspaceRecentOrderRow = WorkspaceSalesRow & {
  account_id: string | null;
  identity_snapshot_json: Record<string, unknown> | null;
  customer_accounts: { name: string | null } | Array<{ name: string | null }> | null;
};
