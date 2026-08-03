import { type ChildProcess, spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'bun:test';

import { getSupabaseMigrationCommandScript } from './supabaseMigrations';

const FAKE_DB_URL = 'postgres://fake-user:fake-password@127.0.0.1:5432/fake-database';

describe('generated Supabase migration command', () => {
  test('disables CLI telemetry for closed-stdin migrations and reports progress', async () => {
    const result = await runGeneratedMigrationCommand(0);

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toContain('Applying pending Supabase migrations...');
    expect(result.stdout).toContain('Supabase migrations applied.');
    expect(result.stderr).toContain('fake Supabase migration output');
    expect(result.args).toEqual(['--yes', 'migration', 'up', '--db-url', FAKE_DB_URL]);
    expect(result.telemetryDisabled).toBe('1');
    expect(result.stdout).not.toContain(FAKE_DB_URL);
    expect(result.stderr).not.toContain(FAKE_DB_URL);
  });

  test('propagates migration failures without reporting completion', async () => {
    const result = await runGeneratedMigrationCommand(23);

    expect(result.exitCode).toBe(23);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toContain('Applying pending Supabase migrations...');
    expect(result.stdout).not.toContain('Supabase migrations applied.');
    expect(result.stderr).toContain('fake Supabase migration output');
    expect(result.telemetryDisabled).toBe('1');
    expect(result.stdout).not.toContain(FAKE_DB_URL);
    expect(result.stderr).not.toContain(FAKE_DB_URL);
  });
});

async function runGeneratedMigrationCommand(fakeExitCode: number): Promise<{
  args: string[];
  exitCode: number | null;
  stderr: string;
  stdout: string;
  telemetryDisabled: string;
  timedOut: boolean;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'ankh-infra-supabase-migrations-'));

  try {
    const fakeBin = path.join(root, 'bin');
    const fakeSupabase = path.join(fakeBin, 'supabase');
    const argsFile = path.join(root, 'supabase-args');
    const telemetryFile = path.join(root, 'supabase-telemetry-disabled');
    const scriptFile = path.join(root, 'run-migrations.sh');
    await mkdir(fakeBin, { recursive: true });
    await writeFile(
      fakeSupabase,
      `#!/usr/bin/env bash
set -euo pipefail

printf '%s\\n' "$@" > "\${ARGS_FILE:?}"
printf '%s\\n' "\${SUPABASE_TELEMETRY_DISABLED:-}" > "\${TELEMETRY_FILE:?}"

echo "fake Supabase migration output" >&2

# Supabase CLI 2.106.0 reached this kind of unbounded telemetry shutdown after
# database work when PostHog was blocked. The generated lifecycle must suppress
# telemetry for this automation-only command so neither the wrapper nor its Go
# child can remain waiting after migration completion or failure.
if [[ "\${SUPABASE_TELEMETRY_DISABLED:-}" != "1" ]]; then
  while true; do
    sleep 1
  done
fi

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
        TELEMETRY_FILE: telemetryFile,
      },
      detached: process.platform !== 'win32',
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
    const { exitCode, timedOut } = await waitForChild(child, 2_000);

    return {
      args: (await readFile(argsFile, 'utf8')).trim().split('\n'),
      exitCode,
      stderr,
      stdout,
      telemetryDisabled: (await readFile(telemetryFile, 'utf8')).trim(),
      timedOut,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function waitForChild(
  child: ChildProcess,
  timeoutMs: number,
): Promise<{ exitCode: number | null; timedOut: boolean }> {
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    terminateChildTree(child);
  }, timeoutMs);

  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    return { exitCode, timedOut };
  } finally {
    clearTimeout(timeout);
  }
}

function terminateChildTree(child: ChildProcess): void {
  if (child.pid === undefined) return;

  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {
      // The process may already have exited between the timeout and cleanup.
    }
  }

  child.kill('SIGKILL');
}
