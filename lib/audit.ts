import { supabaseServer } from './supabaseServer';

export type AuditLogInput = {
  tenantId: string | null;
  actorType?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

export async function writeAuditLog(input: AuditLogInput): Promise<{ error: string | null }> {
  const { error } = await supabaseServer.from('audit_logs').insert({
    tenant_id: input.tenantId,
    actor_type: input.actorType ?? 'system',
    actor_id: input.actorId ?? null,
    actor_name: input.actorName ?? 'Runia Admin',
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    action: input.action,
    before_json: input.before ?? null,
    after_json: input.after ?? null,
    metadata_json: input.metadata ?? null,
  });

  return {
    error: error?.message ?? null,
  };
}
