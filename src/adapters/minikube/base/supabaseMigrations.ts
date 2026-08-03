export function getSupabaseMigrationCommandScript(): string {
  return `echo "Applying pending Supabase migrations..."
SUPABASE_TELEMETRY_DISABLED=1 supabase --yes migration up --db-url "\${SUPABASE_DB_URL}"
echo "Supabase migrations applied."`;
}
