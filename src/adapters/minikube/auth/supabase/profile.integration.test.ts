import { execFile as execFileCallback } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, test } from 'bun:test';

import { generateInfrastructure } from '../../../../index';
import type { GeneratedInfrastructureFile, InfraManifestInput } from '../../../../types';

const execFile = promisify(execFileCallback);
const integrationTest = process.env.ANKH_SUPABASE_INTEGRATION === '1' ? test : test.skip;

describe('generated Supabase profile reconciliation integration', () => {
  integrationTest('drops stale managed columns while preserving custom columns', async () => {
    const { appRoot, minikubeRoot, namespaceHint } = await createIntegrationProject();

    try {
      await writeGeneratedFiles(
        appRoot,
        generateInfrastructure(createManifest({ fields: ['email', 'displayName'] }), {
          namespaceHint,
        }).files,
      );

      await runLocalSupabaseEnv(minikubeRoot);
      await runSupabaseSql(
        minikubeRoot,
        'alter table public.profiles add column if not exists custom_note text;',
      );

      await writeGeneratedFiles(
        appRoot,
        generateInfrastructure(createManifest({ fields: ['email', 'avatarUrl'] }), {
          namespaceHint,
        }).files,
      );
      await runLocalSupabaseEnv(minikubeRoot);

      await runSupabaseSql(
        minikubeRoot,
        `do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'custom_note'
  ) then
    raise exception 'custom column was not preserved';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_name'
  ) then
    raise exception 'stale managed column display_name was not removed';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url'
  ) then
    raise exception 'new managed column avatar_url was not added';
  end if;
end;
$$;`,
      );

      await runSupabaseSql(
        minikubeRoot,
        `select 1
         from ankhorage_internal.generated_schema_state
         where artifact_key = 'auth.profile'
           and table_name = 'profiles';`,
      );
    } finally {
      await execFile('supabase', ['--workdir', minikubeRoot, 'stop', '--no-backup']).catch(() => {
        // Best-effort cleanup for gated local integration runs.
      });
      await rm(appRoot, { recursive: true, force: true });
    }
  });

  integrationTest('is idempotent for unchanged generated reconciliation', async () => {
    const { appRoot, minikubeRoot, namespaceHint } = await createIntegrationProject();

    try {
      await writeGeneratedFiles(
        appRoot,
        generateInfrastructure(createManifest({ fields: ['email', 'displayName'] }), {
          namespaceHint,
        }).files,
      );

      await runLocalSupabaseEnv(minikubeRoot);
      await runLocalSupabaseEnv(minikubeRoot);

      await runSupabaseSql(
        minikubeRoot,
        `select 1
         from ankhorage_internal.generated_schema_state
         where artifact_key = 'auth.profile'
           and table_name = 'profiles';`,
      );
    } finally {
      await cleanupIntegrationProject(appRoot, minikubeRoot);
    }
  });

  integrationTest('rejects profile table rename once generated state exists', async () => {
    const { appRoot, minikubeRoot, namespaceHint } = await createIntegrationProject();

    try {
      await writeGeneratedFiles(
        appRoot,
        generateInfrastructure(createManifest({ table: 'profiles', fields: ['email'] }), {
          namespaceHint,
        }).files,
      );
      await runLocalSupabaseEnv(minikubeRoot);

      await writeGeneratedFiles(
        appRoot,
        generateInfrastructure(createManifest({ table: 'members', fields: ['email'] }), {
          namespaceHint,
        }).files,
      );

      const failure = await expectLocalSupabaseEnvFailure(minikubeRoot);
      expect(failure).toContain('profile.table changed from');
    } finally {
      await cleanupIntegrationProject(appRoot, minikubeRoot);
    }
  });

  integrationTest('rejects profile table removal once generated state exists', async () => {
    const { appRoot, minikubeRoot, namespaceHint } = await createIntegrationProject();

    try {
      await writeGeneratedFiles(
        appRoot,
        generateInfrastructure(createManifest({ table: 'profiles', fields: ['email'] }), {
          namespaceHint,
        }).files,
      );
      await runLocalSupabaseEnv(minikubeRoot);

      await writeGeneratedFiles(
        appRoot,
        generateInfrastructure(createManifest({ table: undefined, fields: ['email'] }), {
          namespaceHint,
        }).files,
      );

      const failure = await expectLocalSupabaseEnvFailure(minikubeRoot);
      expect(failure).toContain('auth.profile.table was removed');
    } finally {
      await cleanupIntegrationProject(appRoot, minikubeRoot);
    }
  });

  integrationTest('stops startup on generated SQL failure', async () => {
    const { appRoot, minikubeRoot, namespaceHint } = await createIntegrationProject();

    try {
      await writeGeneratedFiles(
        appRoot,
        generateInfrastructure(createManifest({ fields: ['email'] }), { namespaceHint }).files,
      );
      await writeFile(
        path.join(minikubeRoot, 'supabase/generated/auth_profiles.sql'),
        'begin;\nselect definitely_missing_function();\ncommit;\n',
        'utf8',
      );

      const failure = await expectLocalSupabaseEnvFailure(minikubeRoot);
      expect(failure).toContain('Generated profile reconciliation failed.');
      expect(failure).toContain('auth_profiles.sql');
      expect(failure).toContain('Exit status:');
    } finally {
      await cleanupIntegrationProject(appRoot, minikubeRoot);
    }
  });

  integrationTest('rejects public.users at generation time', async () => {
    expect(() =>
      generateInfrastructure(createManifest({ table: 'users', fields: ['email'] })),
    ).toThrow('Invalid Supabase profile table identifier "users"');
  });
});

async function createIntegrationProject(): Promise<{
  appRoot: string;
  minikubeRoot: string;
  namespaceHint: string;
}> {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'ankh-infra-supabase-'));
  const namespaceHint = `profile-${Date.now().toString(36)}`;
  return {
    appRoot,
    minikubeRoot: path.join(appRoot, 'infra/minikube'),
    namespaceHint,
  };
}

async function cleanupIntegrationProject(appRoot: string, minikubeRoot: string): Promise<void> {
  await execFile('supabase', ['--workdir', minikubeRoot, 'stop', '--no-backup']).catch(() => {
    // Best-effort cleanup for gated local integration runs.
  });
  await rm(appRoot, { recursive: true, force: true });
}

async function writeGeneratedFiles(
  appRoot: string,
  files: readonly GeneratedInfrastructureFile[],
): Promise<void> {
  for (const file of files) {
    const target = path.join(appRoot, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
    if (file.executable) {
      await chmod(target, 0o755);
    }
  }
}

async function runLocalSupabaseEnv(minikubeRoot: string): Promise<void> {
  await execFile(path.join(minikubeRoot, 'scripts/supabase-local-env.sh'), {
    cwd: minikubeRoot,
    env: { ...process.env, SUPABASE_PROJECT_DIR: minikubeRoot },
  });
}

async function expectLocalSupabaseEnvFailure(minikubeRoot: string): Promise<string> {
  try {
    await runLocalSupabaseEnv(minikubeRoot);
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ''}\n${failure.stderr ?? ''}`;
  }

  throw new Error('Expected local Supabase bootstrap to fail');
}

async function runSupabaseSql(minikubeRoot: string, sql: string): Promise<void> {
  const { stdout } = await execFile('supabase', ['--workdir', minikubeRoot, 'status', '-o', 'env']);
  const dbUrl = readStatusEnv(stdout, 'DB_URL');
  const sqlFile = path.join(minikubeRoot, `integration-${Date.now().toString(36)}.sql`);
  await writeFile(sqlFile, sql, 'utf8');
  await execFile('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', sqlFile]);
  await rm(sqlFile, { force: true });
}

function readStatusEnv(source: string, key: string): string {
  const line = source
    .split('\n')
    .find(
      (entry) =>
        entry === `${key}=` || entry.startsWith(`${key}=`) || entry.startsWith(`export ${key}=`),
    );
  if (!line) {
    throw new Error(`Missing ${key} from supabase status output`);
  }
  return line
    .replace(/^export /, '')
    .slice(`${key}=`.length)
    .replace(/^"|"$/g, '');
}

function createManifest(args: {
  fields: readonly string[];
  table?: string;
  createStrategy?: 'trigger' | 'api';
}): InfraManifestInput {
  const table = Object.hasOwn(args, 'table') ? args.table : 'profiles';
  return {
    deployment: {
      target: 'minikube',
      monitoring: false,
    },
    auth: {
      scope: 'global',
      provider: 'supabase',
      authorization: {
        kind: 'RBAC',
        engine: 'native',
      },
      ...(table
        ? {
            profile: {
              table,
              fields: args.fields,
              primaryKey: 'authUserId',
              createStrategy: args.createStrategy ?? 'trigger',
              updateStrategy: 'api',
            },
          }
        : {
            profile: {
              fields: args.fields,
            },
          }),
    },
    database: {
      provider: 'supabase',
      tier: 'dev',
    },
    networking: {
      cdn: false,
    },
    plugins: [],
  };
}
