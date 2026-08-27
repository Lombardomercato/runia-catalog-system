-- The guarded VINROS plan currently updates thousands of supplier rows in one
-- transaction. Keep the exemption scoped to this RPC instead of changing a
-- role or database-wide timeout.

alter function public.supplier_apply_sync(uuid, jsonb)
  set statement_timeout to '15min';
