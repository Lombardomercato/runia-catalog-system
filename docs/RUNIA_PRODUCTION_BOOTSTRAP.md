# Runia Production bootstrap gate

Runia Production does not currently exist. It must be a new Supabase project,
independent from Runia Dev (`rtnzzfzofeqmtdmbchbw`) and Sommelier IA. Project
creation is blocked until Supabase reports the exact incremental cost and the
owner approves it.

## Build from versioned migrations

Use a new empty project in `sa-east-1`, matching the Runia Dev region. Apply,
in filename order, only the SQL in `db/migrations/001_initial_schema.sql`
through `014_lombardo_commerce_orders.sql`. Do not dump or restore Runia Dev.

After applying the schema:

1. Run `db/tests/tenant_isolation.sql` and
   `db/tests/core_legacy_rls_hardening.sql`.
2. Run Supabase security and performance advisors.
3. Create only the approved Lombardo production tenant/bootstrap metadata.
4. Confirm `anon` and `authenticated` cannot read core, supplier, or commerce
   tables, while the new production `service_role` has the documented access.
5. Store the production URL and secret only in Vercel Production. Never reuse
   the Runia Dev key and never use a `NEXT_PUBLIC_` prefix for a secret.

No Sandbox orders, payment events, test people, VINROS snapshots, or supplier
sync runs are part of the schema bootstrap.

## Vercel Production matrix (prepare only)

| Variable | Production value/source | Exposure |
|---|---|---|
| `RUNIA_ENVIRONMENT` | `production` | Server-only |
| `RUNIA_SUPABASE_URL` | New Runia Production API URL | Server-only |
| `RUNIA_SUPABASE_SECRET_KEY` | New Runia Production secret/service key | Sensitive, server-only |
| `RUNIA_TENANT_SLUG` | Approved production tenant slug | Server-only |
| `NEXT_PUBLIC_SITE_URL` | Canonical Lombardo HTTPS URL | Public |
| `NEXT_PUBLIC_WHATSAPP_URL` | Official configured Lombardo WhatsApp URL | Public |
| `NEXT_PUBLIC_PICKUP_ADDRESS` | Approved public pickup address | Public |
| `NEXT_PUBLIC_PICKUP_HOURS` | Approved public pickup hours | Public |
| `NEXT_PUBLIC_DELIVERY_COST_MODE` | Approved `FREE`, `FLAT_RATE`, or `TO_BE_CONFIRMED` | Public |
| `NEXT_PUBLIC_DELIVERY_FLAT_RATE` | Approved non-negative amount | Public |
| `DELIVERY_COST_MODE` | Must equal the public delivery mode | Server-only |
| `DELIVERY_FLAT_RATE` | Must equal the public delivery rate | Server-only |
| `PAYMENTS_ENABLED` | `false` | Server-only |
| `APP_URL` | Not required while payments are disabled | Server-only |
| `MERCADO_PAGO_MODE` | Do not configure for launch | Server-only |
| `MERCADO_PAGO_ACCESS_TOKEN` | Do not configure LIVE credentials | Sensitive, server-only |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Do not configure LIVE credentials | Sensitive, server-only |

WhatsApp coordination is the launch payment method. This document does not
authorize a Vercel Production deployment.

## First VINROS production write (separate approval required)

1. Run all four current sources in dry-run against an empty, verified supplier
   snapshot and archive the counts, eligibility, source dates, and anomalies.
2. Obtain explicit approval for that exact report and project reference.
3. Execute the first all-or-nothing write.
4. Audit products, current prices, history, anomalies, RLS, and tenant scope.
5. Execute a second write with the same sources and require an idempotent result:
   zero new products and zero price changes.

No VINROS write to Runia Production is authorized by this procedure alone.
