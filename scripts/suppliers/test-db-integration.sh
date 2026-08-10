#!/usr/bin/env bash
set -euo pipefail

if [[ "${SUPPLIER_TEST_CONFIRM_ISOLATED:-}" != "yes" ]]; then
  echo "Refusing to run: set SUPPLIER_TEST_CONFIRM_ISOLATED=yes for a disposable local/test database." >&2
  exit 2
fi
if [[ -z "${SUPPLIER_TEST_DATABASE_URL:-}" ]]; then
  echo "SUPPLIER_TEST_DATABASE_URL is required." >&2
  exit 2
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required." >&2
  exit 2
fi

supplier_test_namespace="${SUPPLIER_TEST_NAMESPACE:-local}"
if [[ ! "$supplier_test_namespace" =~ ^[a-z0-9-]{1,40}$ ]]; then
  echo "SUPPLIER_TEST_NAMESPACE must contain only lowercase letters, numbers, and hyphens." >&2
  exit 2
fi
concurrency_slug="supplier-concurrency-${supplier_test_namespace}"
integration_slug="supplier-integration-${supplier_test_namespace}"
supplier_test_tmp="$(mktemp -d)"
concurrency_tenant_id=""

psql_test() {
  PGCONNECT_TIMEOUT=10 PGOPTIONS='-c statement_timeout=120000' \
    psql -X "$SUPPLIER_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
}

cleanup() {
  if [[ -n "$concurrency_tenant_id" ]]; then
    psql_test -c "delete from public.tenants where id='${concurrency_tenant_id}'::uuid and slug='${concurrency_slug}' and name='Supplier Concurrency Test';" >/dev/null 2>&1 || true
  fi
  rm -rf "$supplier_test_tmp"
}
trap cleanup EXIT

if [[ "${SUPPLIER_TEST_APPLY_MIGRATIONS:-yes}" == "yes" ]]; then
  psql_test -f db/migrations/001_initial_schema.sql
  psql_test -f db/migrations/012_supplier_price_sync.sql
elif [[ "${SUPPLIER_TEST_APPLY_MIGRATIONS:-yes}" != "no" ]]; then
  echo "SUPPLIER_TEST_APPLY_MIGRATIONS must be yes or no." >&2
  exit 2
fi

target_table_count="$(psql_test -Atqc "select count(*) from (values ('suppliers'),('supplier_sync_runs'),('supplier_products'),('supplier_prices'),('supplier_price_history'),('supplier_anomalies')) expected(name) where to_regclass('public.' || expected.name) is not null")"
if [[ "$target_table_count" != "6" ]]; then
  echo "Supplier schema is incomplete: ${target_table_count}/6 target tables." >&2
  exit 1
fi

existing_test_tenants="$(psql_test -Atqc "select count(*) from public.tenants where slug in ('${concurrency_slug}','${integration_slug}')")"
if [[ "$existing_test_tenants" != "0" ]]; then
  echo "Refusing to delete or reuse a pre-existing harness tenant (${concurrency_slug}/${integration_slug})." >&2
  exit 1
fi

concurrency_tenant_id="$(psql_test -Atqc "insert into public.tenants(name, slug) values ('Supplier Concurrency Test', '${concurrency_slug}') returning id")"
if [[ ! "$concurrency_tenant_id" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "Harness could not create its isolated tenant." >&2
  exit 1
fi

test_denied_role() {
  local role="$1"
  local log_file="$supplier_test_tmp/${role}.log"
  set +e
  psql_test -c "begin; set local role ${role}; insert into public.suppliers(tenant_id,code,name) values ('${concurrency_tenant_id}'::uuid,'permission-probe','Permission Probe'); rollback;" >"$log_file" 2>&1
  local status=$?
  set -e
  if [[ $status -eq 0 ]] || ! grep -Eqi 'permission denied|row-level security' "$log_file"; then
    echo "Permission test failed: ${role} was not explicitly denied a supplier write." >&2
    cat "$log_file" >&2
    exit 1
  fi
}

test_denied_role anon
test_denied_role authenticated
psql_test -c "begin; set local role service_role; select public.supplier_open_sync_run('${concurrency_slug}','permission-probe','Permission Probe',60); rollback;" >/dev/null

# Two real sessions race to open the same provider. Exactly one must win.
set +e
psql_test -c "select public.supplier_open_sync_run('${concurrency_slug}','vinros','VINROS',60);" >"$supplier_test_tmp/first.log" 2>&1 &
first_pid=$!
psql_test -c "select public.supplier_open_sync_run('${concurrency_slug}','vinros','VINROS',60);" >"$supplier_test_tmp/second.log" 2>&1 &
second_pid=$!
wait "$first_pid"; first_status=$?
wait "$second_pid"; second_status=$?
set -e
if [[ $((first_status + second_status)) -eq 0 ]] || [[ $first_status -ne 0 && $second_status -ne 0 ]]; then
  echo "Concurrency test failed: expected exactly one successful opener." >&2
  cat "$supplier_test_tmp/first.log" "$supplier_test_tmp/second.log" >&2
  exit 1
fi
failed_log="$supplier_test_tmp/first.log"
if [[ $first_status -eq 0 ]]; then failed_log="$supplier_test_tmp/second.log"; fi
if ! grep -q 'SUPPLIER_SYNC_ALREADY_RUNNING' "$failed_log"; then
  echo "Concurrency test failed for an unexpected reason." >&2
  cat "$failed_log" >&2
  exit 1
fi
running_count="$(psql_test -Atqc "select count(*) from public.supplier_sync_runs r join public.suppliers s on s.id=r.supplier_id where s.tenant_id='${concurrency_tenant_id}'::uuid and r.status='running'")"
if [[ "$running_count" != "1" ]]; then
  echo "Concurrency test failed: expected one running row, got $running_count." >&2
  exit 1
fi
psql_test -c "delete from public.tenants where id='${concurrency_tenant_id}'::uuid and slug='${concurrency_slug}' and name='Supplier Concurrency Test';" >/dev/null
concurrency_tenant_id=""

psql_test -v supplier_test_tenant_slug="$integration_slug" -f scripts/suppliers/supplier-db.integration.sql
