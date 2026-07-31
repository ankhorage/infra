export function getSupabaseMigrationCommandScript(): string {
  return `echo "Applying pending Supabase migrations..."
supabase --yes migration up --db-url "\${SUPABASE_DB_URL}"
echo "Supabase migrations applied."`;
}
