#!/usr/bin/env bash
set -Eeuo pipefail

# Mission Control database/schema diagnostics.
# Read-only by design:
# - no migrations
# - no drizzle push
# - no schema creation
# - no data writes
# - no secret printing

REPO_DIR="${MISSION_CONTROL_REPO_DIR:-/opt/apps/ai-mission-control}"
SERVICE_NAME="${MISSION_CONTROL_SERVICE_NAME:-ai-mission-control-api.service}"

EXPECTED_TABLES=(
  tasks
  content
  events
  memories
  agents
  contacts
  activity
  integrations
  agent_commands
  agent_tools
  agent_tool_access
)

# Keep this list focused on runtime-critical columns only.
REQUIRED_COLUMNS=(
  "tasks:id,title,assignee,priority,status,project,created_at,updated_at"
  "agents:id,name,role,department,status,last_active,avatar_initials,is_plugged_in,provider,model,api_key,endpoint,inbound_token,last_ping"
  "agent_commands:id,agent_id,instructions,context,task_id,created_at,acknowledged_at,delivered_via_http"
  "agent_tools:id,name,category,credential_type,api_key,username,password,is_active,created_at"
  "agent_tool_access:id,agent_id,tool_id,granted_at"
)

section() {
  printf '\n\033[1;36m== %s ==\033[0m\n' "$1"
}

redact_url() {
  sed -E 's#(postgres(ql)?://)[^:@/]+(:[^@/]*)?@#\1[REDACTED]@#g'
}

get_service_environment_value() {
  local key="$1"
  systemctl show "${SERVICE_NAME}" --property=Environment --value 2>/dev/null \
    | tr ' ' '\n' \
    | awk -F= -v key="${key}" '$1 == key { sub("^[^=]*=", ""); print; exit }'
}

load_env() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL found in current shell."
    return 0
  fi

  if [[ -f "${REPO_DIR}/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    . "${REPO_DIR}/.env"
    set +a
    if [[ -n "${DATABASE_URL:-}" ]]; then
      echo "DATABASE_URL loaded from ${REPO_DIR}/.env."
      return 0
    fi
  fi

  DATABASE_URL="$(get_service_environment_value DATABASE_URL || true)"
  if [[ -n "${DATABASE_URL}" ]]; then
    export DATABASE_URL
    echo "DATABASE_URL loaded from ${SERVICE_NAME} systemd environment."
    return 0
  fi

  echo "ERROR: DATABASE_URL not found in current shell, .env, or ${SERVICE_NAME} environment." >&2
  exit 1
}

psql_cmd() {
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -X -q -t -A "$@"
}

section "Mission Control DB/schema diagnostics"
echo "Generated at: $(date -Is 2>/dev/null || date)"
echo "Repo dir: ${REPO_DIR}"
echo "Service: ${SERVICE_NAME}"

section "Safety"
echo "Read-only checks only. No migrations, no drizzle push, no schema writes."

section "Prerequisites"
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is not installed or not in PATH." >&2
  echo "Install postgresql-client before running DB diagnostics."
  exit 1
fi
psql --version

section "Environment"
load_env
echo "DATABASE_URL present: yes"
printf '%s\n' "${DATABASE_URL}" | redact_url | sed 's/^/DATABASE_URL redacted: /'

section "Connection test"
psql_cmd -c "select current_database() || ' on ' || current_user || ' @ ' || inet_server_addr() || ':' || inet_server_port();" | sed 's/^/Connected: /'
psql_cmd -c "select version();" | sed 's/^/Postgres: /'

section "Repo schema files"
if [[ -d "${REPO_DIR}/lib/db/src/schema" ]]; then
  find "${REPO_DIR}/lib/db/src/schema" -maxdepth 1 -type f -name '*.ts' -printf '%f\n' | sort
else
  echo "ERROR: schema directory missing: ${REPO_DIR}/lib/db/src/schema" >&2
fi

section "Public schema tables"
psql_cmd -c "select table_name from information_schema.tables where table_schema = 'public' order by table_name;" | sed 's/^/table: /'

section "Expected table presence"
missing_tables=0
for table in "${EXPECTED_TABLES[@]}"; do
  exists="$(psql_cmd -c "select case when exists (select 1 from information_schema.tables where table_schema='public' and table_name='${table}') then 'yes' else 'no' end;")"
  if [[ "${exists}" == "yes" ]]; then
    echo "OK table ${table}"
  else
    echo "MISSING table ${table}"
    missing_tables=$((missing_tables + 1))
  fi
done

section "Runtime-critical column presence"
missing_columns=0
for spec in "${REQUIRED_COLUMNS[@]}"; do
  table="${spec%%:*}"
  columns_csv="${spec#*:}"
  IFS=',' read -r -a columns <<< "${columns_csv}"
  for column in "${columns[@]}"; do
    exists="$(psql_cmd -c "select case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='${table}' and column_name='${column}') then 'yes' else 'no' end;")"
    if [[ "${exists}" == "yes" ]]; then
      echo "OK column ${table}.${column}"
    else
      echo "MISSING column ${table}.${column}"
      missing_columns=$((missing_columns + 1))
    fi
  done
done

section "Row counts for expected tables"
for table in "${EXPECTED_TABLES[@]}"; do
  exists="$(psql_cmd -c "select case when exists (select 1 from information_schema.tables where table_schema='public' and table_name='${table}') then 'yes' else 'no' end;")"
  if [[ "${exists}" == "yes" ]]; then
    count="$(psql_cmd -c "select count(*) from public.${table};")"
    echo "${table}: ${count} rows"
  fi
done

section "Summary"
echo "Missing tables: ${missing_tables}"
echo "Missing runtime-critical columns: ${missing_columns}"

if [[ "${missing_tables}" -gt 0 || "${missing_columns}" -gt 0 ]]; then
  echo "DB diagnostics completed with schema gaps. Do not run automated writes until reviewed."
  exit 2
fi

echo "DB diagnostics passed for expected runtime-critical tables and columns."
