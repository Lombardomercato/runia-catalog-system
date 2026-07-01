import type { AuditLogRow, WorkspaceActivity } from './types';

export function mapAuditLogRowToActivity(row: AuditLogRow): WorkspaceActivity {
  const label = getActivityLabel(row.entity_type, row.action);

  return {
    id: row.id,
    label,
    description: buildActivityDescription(row.entity_type, row.action, row.entity_id),
    actorName: row.actor_name,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    createdAt: row.created_at,
    href: getActivityHref(row.entity_type, row.entity_id),
  };
}

export function formatWorkspaceDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha no disponible';
  }

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getActivityLabel(entityType: string, action: string) {
  if (entityType === 'product' && action.includes('updated')) {
    return 'Producto actualizado';
  }

  if (entityType === 'product_price' || action.includes('price')) {
    return 'Precio modificado';
  }

  if (entityType === 'sales_order' && action.includes('created')) {
    return 'Pedido creado';
  }

  if (entityType === 'sales_order' && action.includes('updated')) {
    return 'Pedido actualizado';
  }

  if (entityType === 'import_batch' || action.includes('import')) {
    return 'Importacion ejecutada';
  }

  return toHumanLabel(action || entityType);
}

function buildActivityDescription(entityType: string, action: string, entityId: string | null) {
  const target = entityId ? `ID ${entityId.slice(0, 8)}` : 'sin ID publico';

  if (entityType === 'sales_order') {
    return `${toHumanLabel(action)} sobre pedido ${target}.`;
  }

  if (entityType === 'product') {
    return `${toHumanLabel(action)} sobre producto ${target}.`;
  }

  if (entityType === 'product_price') {
    return `${toHumanLabel(action)} sobre precio ${target}.`;
  }

  if (entityType === 'import_batch') {
    return `${toHumanLabel(action)} sobre importacion ${target}.`;
  }

  return `${toHumanLabel(action)} sobre ${toHumanLabel(entityType)} ${target}.`;
}

function getActivityHref(entityType: string, entityId: string | null) {
  if (!entityId) {
    return null;
  }

  if (entityType === 'sales_order') {
    return `/admin/sales/${entityId}`;
  }

  if (entityType === 'product') {
    return `/admin/productos/${entityId}`;
  }

  return null;
}

function toHumanLabel(value: string) {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}
