import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'bun:test';

import { getSupabaseMigrationCommandScript } from './supabaseMigrations';

const FAKE_DB_URL = 'postgres://fake-user:fake-password@127.0.0.1:5432/fake-database';

describe('generated Supabase migration command', () => {
  test('runs non-interactively with closed stdin and reports progress', async () => {
    const result = await runGeneratedMigrationCommand(0);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Applying pending Supabase migrations...');
    expect(result.stdout).toContain('Supabase migrations applied.');
    expect(result.stderr).toContain('fake Supabase migration output');
    expect(result.args).toEqual(['--yes', 'migration', 'up', '--db-url', FAKE_DB_URL]);
  });

  test('propagates migration failures without reporting completion', async () => {
    const result = await runGeneratedMigrationCommand(23);

    expect(result.exitCode).toBe(23);
    expect(result.stdout).toContain('Applying pending Supabase migrations...');
    expect(result.stdout).not.toContain('Supabase migrations applied.');
    expect(result.stderr).toContain('fake Supabase migration output');
  });
});

async function runGeneratedMigrationCommand(fakeExitCode: number): Promise<{
  args: string[];
  exitCode: number | null;
  stderr: string;
  stdout: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'ankh-infra-supabase-migrations-'));

  try {
    const fakeBin = path.join(root, 'bin');
    const fakeSupabase = path.join(fakeBin, 'supabase');
    const argsFile = path.join(root, 'supabase-args');
    const scriptFile = path.join(root, 'run-migrations.sh');
    await mkdir(fakeBin, { recursive: true });
    await writeFile(
      fakeSupabase,
      `#!/usr/bin/env bash
set -euo pipefail

printf '%s\\n' "$@" > "\${ARGS_FILE:?}"
if [[ "\${1:-}" != "--yes" ]]; then
  echo "missing required non-interactive flag" >&2
  IFS= read -r ignored
  exit 64
fi

echo "fake Supabase migration output" >&2
exit "\${FAKE_SUPABASE_EXIT_CODE:-0}"
`,
      'utf8',
    );
    await chmod(fakeSupabase, 0o755);
    await writeFile(
      scriptFile,
      `#!/usr/bin/env bash
set -Eeuo pipefail

SUPABASE_DB_URL="${FAKE_DB_URL}"
export SUPABASE_DB_URL

${getSupabaseMigrationCommandScript()}
`,
      'utf8',
    );
    await chmod(scriptFile, 0o755);

    const child = spawn('bash', [scriptFile], {
      cwd: root,
      env: {
        ...process.env,
        ARGS_FILE: argsFile,
        FAKE_SUPABASE_EXIT_CODE: String(fakeExitCode),
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });

    return {
      args: (await readFile(argsFile, 'utf8')).trim().split('\n'),
      exitCode,
      stderr,
      stdout,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
