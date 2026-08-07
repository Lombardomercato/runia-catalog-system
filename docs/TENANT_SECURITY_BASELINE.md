# Tenant security baseline

## Scope

Migrations `010` and `011` establish database-enforced tenant integrity, deny
direct table access to `anon` and `authenticated`, and add hostname mappings.
They do not create Lombardo, tenant users, or customer-facing admin accounts.

The current admin remains an internal Runia tool protected by one
`ADMIN_PASSWORD`. Its selected-tenant cookie is an operational selector, not an
authorization boundary.

## Service-role boundary

`lib/supabaseServer.ts` is the only constructor that reads
`SUPABASE_SERVICE_ROLE_KEY`. It imports `server-only`; no client component imports
it, and the key has no `NEXT_PUBLIC_` prefix.

### A. Justified for the current MVP

- Setup provisioning RPC in `modules/setup/queries.ts`.
- Transactional public-order RPC in
  `modules/public-commerce/server/publicSalesOrderPersistence.ts`.
- Import jobs and audit writes in `modules/imports/*` and `lib/audit.ts`.
- Server-side hostname lookup in `lib/tenantResolver.ts`.

These operations are server-only, and the two RPCs revoke execution from
`public`, `anon`, and `authenticated`.

### B. Replace later

- Public catalog reads in `modules/catalog/repositories/*` and
  `modules/tenant/repositories/*`.
- Internal reads and writes in accounts, products, pricing, sales, tenant,
  workspace, and admin modules.

After Supabase Auth and `tenant_memberships` exist, these should use an
authenticated server client so RLS enforces the operator's tenant. Until then,
every query and command must resolve the tenant server-side and filter by
`tenant_id`.

### C. Dangerous patterns corrected or prohibited

- Direct `anon`/`authenticated` table access is revoked and denied by policy.
- Public production pages no longer use `runia_selected_tenant_slug`.
- `tenant_domains` is queried only on the server.
- The service-role key must never be returned from routes, serialized into
  props, logged, or introduced under a `NEXT_PUBLIC_` name.

No browser code currently imports `lib/supabaseServer.ts`. `lib/supabaseClient.ts`
constructs an anon client but has no consumers in the current application.

## What RLS does and does not protect

RLS protects direct requests made with `anon` or `authenticated`. The application
currently uses service role for its backend data access, and service role bypasses
RLS. Consequently:

- RLS prevents accidental public exposure of tables.
- Composite foreign keys prevent cross-tenant references even for service role.
- Application-level tenant filters are still mandatory for service-role reads.
- A future authenticated admin should stop using service role for ordinary CRUD.

Public catalog and checkout continue to work through server-side code. There are
no public-select policies because no browser currently needs direct Supabase
table access.

## Domain resolution

For public production surfaces:

1. normalize the request hostname;
2. look up an active row in `tenant_domains`;
3. require an active tenant;
4. use `NEXT_PUBLIC_TENANT_SLUG` only as a temporary per-deployment fallback.

The selected-tenant cookie is accepted only by internal Runia surfaces,
non-production environments, and localhost.

`x-forwarded-host` is accepted because common deployment platforms set it. The
production proxy must overwrite, not append from an untrusted client. If that
cannot be guaranteed, configure the platform to use `Host` exclusively.

## Applying the migrations

Before applying to a real Supabase project:

1. create and verify a database backup;
2. compare the deployed schema with migrations `001` through `009`;
3. run the preflight queries at the start of migration `010`;
4. apply `010` in a staging clone first;
5. run `db/tests/tenant_isolation.sql` against staging;
6. smoke-test RB catalog, checkout, admin, importer, and order creation;
7. apply `011`;
8. insert the existing RB hostname mapping only after confirming its canonical
   domain;
9. deploy the hostname resolver;
10. repeat the isolation and RB smoke tests in production.

Migration `010` intentionally aborts if existing rows contain a cross-tenant
relationship. Investigate such rows manually; do not auto-reassign or delete
them.
