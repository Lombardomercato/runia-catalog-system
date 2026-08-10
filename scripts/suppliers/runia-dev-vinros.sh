#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
cd "$repo_root"

action="${1:-}"
node_binary="${NODE_BINARY:-node}"
target_table_count=""
tenant_supplier_count=""
tenant_product_count=""
tenant_run_count=""

readonly list_1_url='https://docs.google.com/spreadsheets/d/1RfIul9S8Zuyd2H8BiYNd7oMDQtNL2NXm/edit?gid=1877280813#gid=1877280813'
readonly list_2_url='https://docs.google.com/spreadsheets/d/1RKu0ldsucFIk0fXCVh2KHSi1EVTPM7Gz/edit?gid=223050305#gid=223050305'
readonly list_3_url='https://docs.google.com/spreadsheets/d/1DdbZSzvLTgtLeTewwpwkjMT6OnTe0Dsb/edit?gid=364032974#gid=364032974'
readonly list_4_url='https://docs.google.com/spreadsheets/d/1QImDzrFNFFw7qjV8Z1GE5h-053EoDBkB/edit?gid=1011739089#gid=1011739089'

fail() {
  echo "RUNIA DEV SAFETY GATE: FAIL — $*" >&2
  exit 2
}

required_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "falta $name"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "se requiere el comando $1"
}

psql_scalar() {
  PGCONNECT_TIMEOUT=10 PGOPTIONS='-c statement_timeout=15000' \
    psql -X "$RUNIA_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "$1"
}

validate_identity_inputs() {
  required_env RUNIA_DEV_SUPABASE_URL
  required_env RUNIA_DEV_SUPABASE_SECRET_KEY
  required_env RUNIA_DEV_PROJECT_REF
  required_env RUNIA_DEV_DATABASE_URL
  required_env RUNIA_DEV_TENANT_SLUG
  required_env RUNIA_DEV_CONFIRM_ISOLATED
  require_command "$node_binary"
  require_command psql

  [[ "$RUNIA_DEV_PROJECT_REF" =~ ^[a-z0-9]{8,40}$ ]] || fail 'RUNIA_DEV_PROJECT_REF tiene formato invalido'
  [[ "$RUNIA_DEV_TENANT_SLUG" =~ ^[a-z0-9][a-z0-9-]{1,62}$ ]] || fail 'RUNIA_DEV_TENANT_SLUG debe ser un slug explicito en minusculas'
  [[ "${RUNIA_DEV_SUPABASE_URL%/}" == "https://${RUNIA_DEV_PROJECT_REF}.supabase.co" ]] || fail 'la URL no coincide con RUNIA_DEV_PROJECT_REF'
  [[ "$RUNIA_DEV_DATABASE_URL" == postgresql://* || "$RUNIA_DEV_DATABASE_URL" == postgres://* ]] || fail 'RUNIA_DEV_DATABASE_URL no es una conexion PostgreSQL'
  [[ "$RUNIA_DEV_DATABASE_URL" == *"$RUNIA_DEV_PROJECT_REF"* ]] || fail 'la conexion PostgreSQL no contiene el project_ref esperado'
  [[ "$RUNIA_DEV_CONFIRM_ISOLATED" == "RUNIA_DEV_ONLY:${RUNIA_DEV_PROJECT_REF}" ]] || fail 'confirmacion aislada incorrecta para este project_ref'

  if [[ -n "${RUNIA_PRODUCTION_PROJECT_REF:-}" && "$RUNIA_DEV_PROJECT_REF" == "$RUNIA_PRODUCTION_PROJECT_REF" ]]; then
    fail 'RUNIA_DEV_PROJECT_REF coincide con RUNIA_PRODUCTION_PROJECT_REF'
  fi
  if [[ -n "${SOMMELIER_IA_PROJECT_REF:-}" && "$RUNIA_DEV_PROJECT_REF" == "$SOMMELIER_IA_PROJECT_REF" ]]; then
    fail 'RUNIA_DEV_PROJECT_REF coincide con SOMMELIER_IA_PROJECT_REF'
  fi
  if [[ -n "${RUNIA_PROTECTED_PROJECT_REFS:-}" ]]; then
    local protected_ref
    IFS=',' read -r -a protected_refs <<< "$RUNIA_PROTECTED_PROJECT_REFS"
    for protected_ref in "${protected_refs[@]}"; do
      protected_ref="${protected_ref//[[:space:]]/}"
      [[ -z "$protected_ref" || "$RUNIA_DEV_PROJECT_REF" != "$protected_ref" ]] || fail 'el project_ref aparece en RUNIA_PROTECTED_PROJECT_REFS'
    done
  fi
}

read_database_state() {
  local base_ready tenant_rows tenant_status
  base_ready="$(psql_scalar "select (to_regclass('public.tenants') is not null and to_regprocedure('public.update_updated_at_column()') is not null)::int")"
  [[ "$base_ready" == '1' ]] || fail 'Runia Dev no tiene el esquema base requerido (tenants/update_updated_at_column)'

  tenant_rows="$(psql_scalar "select count(*) from public.tenants where slug = '${RUNIA_DEV_TENANT_SLUG}'")"
  [[ "$tenant_rows" == '1' ]] || fail "se esperaba exactamente un tenant ${RUNIA_DEV_TENANT_SLUG}; encontrados=${tenant_rows}"
  tenant_status="$(psql_scalar "select status from public.tenants where slug = '${RUNIA_DEV_TENANT_SLUG}'")"
  [[ "$tenant_status" == 'active' ]] || fail "el tenant destino no esta activo (status=${tenant_status})"

  target_table_count="$(psql_scalar "select count(*) from (values ('suppliers'),('supplier_sync_runs'),('supplier_products'),('supplier_prices'),('supplier_price_history'),('supplier_anomalies')) expected(name) where to_regclass('public.' || expected.name) is not null")"
  [[ "$target_table_count" == '0' || "$target_table_count" == '6' ]] || fail "estado parcial peligroso: existen ${target_table_count}/6 tablas supplier"

  tenant_supplier_count='0'
  tenant_product_count='0'
  tenant_run_count='0'
  if [[ "$target_table_count" == '6' ]]; then
    tenant_supplier_count="$(psql_scalar "select count(*) from public.suppliers s join public.tenants t on t.id=s.tenant_id where t.slug='${RUNIA_DEV_TENANT_SLUG}' and s.code='vinros'")"
    tenant_product_count="$(psql_scalar "select count(*) from public.supplier_products p join public.suppliers s on s.id=p.supplier_id join public.tenants t on t.id=s.tenant_id where t.slug='${RUNIA_DEV_TENANT_SLUG}' and s.code='vinros'")"
    tenant_run_count="$(psql_scalar "select count(*) from public.supplier_sync_runs r join public.suppliers s on s.id=r.supplier_id join public.tenants t on t.id=s.tenant_id where t.slug='${RUNIA_DEV_TENANT_SLUG}' and s.code='vinros'")"
    local running_count
    running_count="$(psql_scalar "select count(*) from public.supplier_sync_runs r join public.suppliers s on s.id=r.supplier_id join public.tenants t on t.id=s.tenant_id where t.slug='${RUNIA_DEV_TENANT_SLUG}' and s.code='vinros' and r.status='running'")"
    [[ "$running_count" == '0' ]] || fail "hay ${running_count} sync VINROS en ejecucion"
  fi
}

preflight() {
  validate_identity_inputs
  "$node_binary" --import tsx scripts/suppliers/runia-dev-api-preflight.ts
  read_database_state
  if [[ "$target_table_count" == '6' ]]; then
    verify_schema
  fi
  local database_name database_user server_version
  database_name="$(psql_scalar 'select current_database()')"
  database_user="$(psql_scalar 'select current_user')"
  server_version="$(psql_scalar "select current_setting('server_version')")"
  echo "DB preflight: PASS project_ref=${RUNIA_DEV_PROJECT_REF} database=${database_name} user=${database_user} postgres=${server_version}"
  echo "Target: tenant=${RUNIA_DEV_TENANT_SLUG} supplier_tables=${target_table_count}/6 vinros_suppliers=${tenant_supplier_count} products=${tenant_product_count} runs=${tenant_run_count}"
  echo 'PRE-FLIGHT RUNIA DEV = PASS (read-only)'
}

require_schema_absent() {
  [[ "$target_table_count" == '0' ]] || fail 'migrate exige 0/6 tablas supplier; use verify si 010 ya fue aplicada'
}

require_schema_complete() {
  [[ "$target_table_count" == '6' ]] || fail 'se requieren las 6 tablas supplier; aplique primero la migracion 010'
}

require_empty_vinros_snapshot() {
  [[ "$tenant_supplier_count" == '0' && "$tenant_product_count" == '0' && "$tenant_run_count" == '0' ]] || \
    fail "se esperaba snapshot VINROS vacio; suppliers=${tenant_supplier_count} products=${tenant_product_count} runs=${tenant_run_count}"
}

require_populated_vinros_snapshot() {
  [[ "$tenant_supplier_count" == '1' && "$tenant_product_count" == '3897' && "$tenant_run_count" -ge '1' ]] || \
    fail "se esperaba VINROS poblado tras el primer write; suppliers=${tenant_supplier_count} products=${tenant_product_count} runs=${tenant_run_count}"
}

verify_schema() {
  require_schema_complete
  PGCONNECT_TIMEOUT=10 PGOPTIONS='-c statement_timeout=30000' \
    psql -X "$RUNIA_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 \
      -f scripts/suppliers/runia-dev-schema-verification.sql
}

configure_vinros_environment() {
  export SUPABASE_URL="$RUNIA_DEV_SUPABASE_URL"
  export SUPABASE_SERVICE_ROLE_KEY="$RUNIA_DEV_SUPABASE_SECRET_KEY"
  export VINROS_TENANT_SLUG="$RUNIA_DEV_TENANT_SLUG"
  export VINROS_LIST_1_URL="$list_1_url"
  export VINROS_LIST_2_URL="$list_2_url"
  export VINROS_LIST_3_URL="$list_3_url"
  export VINROS_LIST_4_URL="$list_4_url"
  export VINROS_LIST_1_BASELINE_ROWS='3284'
  export VINROS_LIST_2_BASELINE_ROWS='3281'
  export VINROS_LIST_3_BASELINE_ROWS='3279'
  export VINROS_LIST_4_BASELINE_ROWS='3875'
  export VINROS_MINIMUM_PRODUCTS_PER_LIST='10'
  export VINROS_RUN_LEASE_SECONDS='1800'
}

run_dry_gate() {
  local expectation="$1"
  configure_vinros_environment
  "$node_binary" --import ./scripts/register-server-only-test-hook.mjs --import tsx \
    scripts/suppliers/runia-dev-dry-gate.ts "$expectation"
}

run_write() {
  local expectation="$1"
  configure_vinros_environment
  "$node_binary" --import ./scripts/register-server-only-test-hook.mjs --import tsx \
    scripts/suppliers/runia-dev-write.ts "$expectation"
}

run_harness() {
  [[ "${RUNIA_DEV_CONFIRM_HARNESS:-}" == "RUNIA_DEV_HARNESS:${RUNIA_DEV_PROJECT_REF}" ]] || \
    fail 'falta confirmacion exacta RUNIA_DEV_CONFIRM_HARNESS para ejecutar el harness temporal'
  SUPPLIER_TEST_CONFIRM_ISOLATED=yes \
  SUPPLIER_TEST_DATABASE_URL="$RUNIA_DEV_DATABASE_URL" \
  SUPPLIER_TEST_APPLY_MIGRATIONS=no \
  SUPPLIER_TEST_NAMESPACE="$RUNIA_DEV_PROJECT_REF" \
    bash scripts/suppliers/test-db-integration.sh
}

post_write_audit() {
  local mode="$1"
  PGCONNECT_TIMEOUT=10 PGOPTIONS='-c statement_timeout=60000' \
    psql -X "$RUNIA_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 \
      -v tenant_slug="$RUNIA_DEV_TENANT_SLUG" -v audit_mode="$mode" \
      -f scripts/suppliers/runia-dev-post-write-audit.sql
}

case "$action" in
  preflight)
    preflight
    ;;
  migrate)
    preflight
    require_schema_absent
    [[ "${RUNIA_DEV_CONFIRM_MIGRATION:-}" == "APPLY_012_TO_RUNIA_DEV:${RUNIA_DEV_PROJECT_REF}" ]] || \
      fail 'falta confirmacion exacta RUNIA_DEV_CONFIRM_MIGRATION'
    PGCONNECT_TIMEOUT=10 PGOPTIONS='-c statement_timeout=120000 -c lock_timeout=10000' \
      psql -X "$RUNIA_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
        -f db/migrations/012_supplier_price_sync.sql
    target_table_count='6'
    verify_schema
    echo 'MIGRATION 010 RUNIA DEV = PASS'
    ;;
  verify)
    preflight
    ;;
  harness)
    preflight
    run_harness
    ;;
  dry)
    preflight
    require_empty_vinros_snapshot
    run_dry_gate --expect-empty
    ;;
  write-first)
    preflight
    require_empty_vinros_snapshot
    [[ "${RUNIA_DEV_CONFIRM_FIRST_WRITE:-}" == "WRITE_VINROS_TO_RUNIA_DEV:${RUNIA_DEV_PROJECT_REF}:${RUNIA_DEV_TENANT_SLUG}" ]] || \
      fail 'falta confirmacion exacta RUNIA_DEV_CONFIRM_FIRST_WRITE'
    run_harness
    run_dry_gate --expect-empty
    run_write --expect-empty
    post_write_audit first
    ;;
  audit-first)
    preflight
    require_populated_vinros_snapshot
    post_write_audit first
    ;;
  write-second)
    preflight
    require_populated_vinros_snapshot
    [[ "${RUNIA_DEV_CONFIRM_SECOND_WRITE:-}" == "REPEAT_VINROS_IN_RUNIA_DEV:${RUNIA_DEV_PROJECT_REF}:${RUNIA_DEV_TENANT_SLUG}" ]] || \
      fail 'falta confirmacion exacta RUNIA_DEV_CONFIRM_SECOND_WRITE'
    run_dry_gate --expect-idempotent
    run_write --expect-idempotent
    post_write_audit second
    ;;
  audit-second)
    preflight
    require_populated_vinros_snapshot
    post_write_audit second
    ;;
  *)
    echo 'Uso: runia-dev-vinros.sh {preflight|migrate|verify|harness|dry|write-first|audit-first|write-second|audit-second}' >&2
    exit 2
    ;;
esac
