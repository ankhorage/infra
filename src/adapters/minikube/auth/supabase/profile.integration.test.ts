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
    const appRoot = await mkdtemp(path.join(tmpdir(), 'ankh-infra-supabase-'));
    const namespaceHint = `profile-${Date.now().toString(36)}`;
    const minikubeRoot = path.join(appRoot, 'infra/minikube');

    try {
      await writeGeneratedFiles(
        appRoot,
        generateInfrastructure(createManifest(['email', 'displayName']), { namespaceHint }).files,
      );

      await runLocalSupabaseEnv(minikubeRoot);
      await runSupabaseSql(
        minikubeRoot,
        'alter table public.profiles add column if not exists custom_note text;',
      );

      await writeGeneratedFiles(
        appRoot,
        generateInfrastructure(createManifest(['email', 'avatarUrl']), { namespaceHint }).files,
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

      const { stdout } = await execFile(path.join(minikubeRoot, 'scripts/status.sh'), {
        cwd: minikubeRoot,
        env: { ...process.env, SUPABASE_PROJECT_DIR: minikubeRoot },
      });

      expect(stdout).toContain('profile reconciliation: applied, checksum matches');
      expect(stdout).toContain('profile schema: verified');
    } finally {
      await execFile('supabase', ['--workdir', minikubeRoot, 'stop', '--no-backup']).catch(() => {
        // Best-effort cleanup for gated local integration runs.
      });
      await rm(appRoot, { recursive: true, force: true });
    }
  });
});

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

async function runSupabaseSql(minikubeRoot: string, sql: string): Promise<void> {
  await execFile('supabase', ['--workdir', minikubeRoot, 'db', 'query', '--local', sql]);
}

function createManifest(fields: readonly string[]): InfraManifestInput {
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
      profile: {
        table: 'profiles',
        fields,
        primaryKey: 'authUserId',
        createStrategy: 'trigger',
        updateStrategy: 'api',
      },
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
