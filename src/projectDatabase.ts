import { readProjectInfrastructureEnvironment } from './projectEnvironment.js';

const DATABASE_URL_KEYS = [
  'ANKH_SECRET_STORE_DATABASE_URL',
  'SUPABASE_DB_URL',
  'POSTGRES_URL',
  'DB_URL',
  'DATABASE_URL',
] as const;

export async function resolveProjectInfrastructureDatabaseUrl(args: {
  readonly projectPath: string;
  readonly target: string;
}): Promise<string | null> {
  const environment = await readProjectInfrastructureEnvironment({
    keys: DATABASE_URL_KEYS,
    projectPath: args.projectPath,
    target: args.target,
  });

  for (const key of DATABASE_URL_KEYS) {
    const value = environment[key]?.trim();
    if (value) return value;
  }

  return null;
}
