-- Runia Catalog System - audit logs
-- Creates a generic append-only audit trail for future write operations.
-- This migration only creates the table and indexes; application commands will
-- start writing audit events in a later phase.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  actor_type text,
  actor_id text,
  actor_name text,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_json jsonb,
  after_json jsonb,
  metadata_json jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_actor_type_not_blank check (actor_type is null or btrim(actor_type) <> ''),
  constraint audit_logs_actor_id_not_blank check (actor_id is null or btrim(actor_id) <> ''),
  constraint audit_logs_actor_name_not_blank check (actor_name is null or btrim(actor_name) <> ''),
  constraint audit_logs_entity_type_not_blank check (btrim(entity_type) <> ''),
  constraint audit_logs_action_not_blank check (btrim(action) <> '')
);

create index if not exists audit_logs_tenant_id_idx on public.audit_logs(tenant_id);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index if not exists audit_logs_action_idx on public.audit_logs(action);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at);
