import type {
  AuditLogRow,
  WorkspaceActivity,
  WorkspaceRecentOrder,
  WorkspaceRecentOrderRow,
} from './types';

const relevantActions = new Set([
  'sales_order.created',
  'sales_order_created',
  'sales_order.duplicated',
  'sales_order.status_updated',
  'product_price.updated',
  'catalog.import_completed',
  'catalog.import_failed',
]);

export function isWorkspaceActivity(row: AuditLogRow) {
  return relevantActions.has(row.action);
}

export function mapAuditLogRowToActivity(row: AuditLogRow): WorkspaceActivity {
  return {
    id: row.id,
    label: getActivityLabel(row.action),
    description: buildActivityDescription(row),
    actorName: row.actor_name,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    createdAt: row.created_at,
    href: getActivityHref(row.entity_type, row.entity_id),
  };
}

export function mapRecentOrderRow(row: WorkspaceRecentOrderRow): WorkspaceRecentOrder {
  const account = Array.isArray(row.customer_accounts)
    ? row.customer_accounts[0]
    : row.customer_accounts;
  const snapshotName = textValue(row.identity_snapshot_json?.name);
  return {
    id: row.id,
    customerName: account?.name?.trim() || snapshotName || 'Sin identificar',
    total: numberValue(row.total),
    currency: normalizeCurrency(row.currency),
    status: row.status,
    createdAt: row.created_at,
  };
}

export function formatWorkspaceDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function workspaceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: 'Borrador',
    pending: 'Pendiente',
    confirmed: 'Confirmado',
    preparing: 'En preparacion',
    delivered: 'Entregado',
    closed: 'Cerrado',
    cancelled: 'Cancelado',
  };
  return labels[status] ?? status;
}

function getActivityLabel(action: string) {
  if (action === 'sales_order.created' || action === 'sales_order_created') return 'Pedido creado';
  if (action === 'sales_order.duplicated') return 'Pedido duplicado';
  if (action === 'sales_order.status_updated') return 'Estado actualizado';
  if (action === 'product_price.updated') return 'Precio actualizado';
  if (action === 'catalog.import_completed') return 'Importacion ejecutada';
  if (action === 'catalog.import_failed') return 'Importacion con errores';
  return toHumanLabel(action);
}

function buildActivityDescription(row: AuditLogRow) {
  const shortId = row.entity_id ? `#${row.entity_id.slice(0, 8).toUpperCase()}` : 'sin ID';
  if (row.action === 'sales_order.status_updated') {
    const before = textValue(row.before_json?.status);
    const after = textValue(row.after_json?.status);
    return before && after
      ? `${shortId}: ${workspaceStatusLabel(before)} a ${workspaceStatusLabel(after)}.`
      : `Cambio de estado sobre pedido ${shortId}.`;
  }
  if (row.entity_type === 'sales_order') return `${getActivityLabel(row.action)} ${shortId}.`;
  if (row.entity_type === 'product_price') return `${getActivityLabel(row.action)} ${shortId}.`;
  if (row.entity_type === 'import_batch') return `${getActivityLabel(row.action)} ${shortId}.`;
  return `${getActivityLabel(row.action)} ${shortId}.`;
}

function getActivityHref(entityType: string, entityId: string | null) {
  if (!entityId) return null;
  if (entityType === 'sales_order') return `/admin/sales/${entityId}`;
  if (entityType === 'product') return `/admin/productos/${entityId}`;
  return null;
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: number | string | null) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCurrency(value: string | null) {
  const currency = value?.trim().toUpperCase() ?? '';
  return /^[A-Z]{3}$/.test(currency) ? currency : 'ARS';
}

function toHumanLabel(value: string) {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}
