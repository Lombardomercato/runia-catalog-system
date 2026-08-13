# Runia core/legacy consumer inventory

## Verified boundary

The inventory covers the current source in `runia-catalog-system` and Lombardo
2.0. Runia constructs its operational client only in `lib/supabaseServer.ts`,
which imports `server-only` and uses `SUPABASE_SERVICE_ROLE_KEY`. The anon client
in `lib/supabaseClient.ts` has no imports or runtime consumers. Lombardo accesses
Supabase only from server routes/components with its Runia secret key.

No browser needs direct access to a core or legacy table. Public catalog and
checkout flows are browser → server API/Server Component → service role →
Supabase. Therefore no public SELECT or write policy is justified.

## Matrix

| Table | Current runtime consumer | Role | Required access | Safe to enable RLS | Policy needed |
|---|---|---|---|---|---|
| `tenants` | Runia tenant/setup/admin/public catalog; VINROS tenant lookup; Lombardo supplier join | `service_role`, server-only | SELECT, INSERT, UPDATE, DELETE | Yes | No public policy; explicit deny for `anon`/`authenticated` |
| `categories` | Runia catalog, product admin, pricing and importer | `service_role`, server-only | SELECT, INSERT, UPDATE | Yes | No public policy; explicit deny |
| `brands` | Runia catalog, product admin, pricing, setup and importer | `service_role`, server-only | SELECT, INSERT, UPDATE | Yes | No public policy; explicit deny |
| `products` | Runia public catalog SDK, admin, pricing, sales and importer | `service_role`, server-only | SELECT, INSERT, UPDATE | Yes | No public policy; explicit deny |
| `price_lists` | Runia tenant setup, catalog, pricing, accounts, sales and importer | `service_role`, server-only | SELECT, INSERT, UPDATE | Yes | No public policy; explicit deny |
| `product_prices` | Runia catalog, pricing, sales and importer | `service_role`, server-only | SELECT, INSERT, UPDATE | Yes | No public policy; explicit deny |
| `product_images` | No current source consumer; feature flag is inactive | None | None | Yes | No public policy; explicit deny and no service grant |
| `customer_accounts` | Runia accounts, sales and workspace | `service_role`, server-only | SELECT, INSERT, UPDATE, DELETE | Yes | No public policy; explicit deny |
| `orders` | Legacy admin count only; current order engine uses `sales_orders`; Lombardo uses `commerce_orders` | `service_role`, server-only | SELECT | Yes | No public policy; explicit deny |
| `order_items` | No current runtime consumer; current engine uses `sales_order_items` | None | None | Yes | No public policy; explicit deny and no service grant |
| `import_batches` | Runia importer | `service_role`, server-only | SELECT, INSERT, UPDATE | Yes | No public policy; explicit deny |
| `import_rows` | Runia importer tracking | `service_role`, server-only | SELECT, INSERT, UPDATE | Yes | No public policy; explicit deny |

## Out-of-scope protected tables

The supplier layer (`suppliers`, `supplier_sync_runs`, `supplier_products`,
`supplier_prices`, `supplier_price_history`, `supplier_anomalies`) and Lombardo
commerce tables already have RLS enabled, no browser grants, and service-role
access. Migration `013` does not alter them.

Future browser access requires a new demonstrated use case, Supabase Auth,
tenant membership authorization, indexed tenant predicates, and a separate
migration. `TO authenticated` alone is not tenant authorization.

Supabase may report `rls_enabled_no_policy` as informational for supplier and
commerce tables. This is intentional: those tables are closed server-only
surfaces with no `anon`/`authenticated` grants, and `service_role` bypasses RLS.
Adding a permissive public policy would weaken the verified boundary.
