import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { InfraControlPlaneCredentialRef } from '@ankhorage/contracts/infra';
import { expect, it } from 'bun:test';

import { createProjectInfraCredentialPort } from './features/environment-lifecycle/adapters/outbound/createProjectInfraCredentialPort';

const bootstrap = reference('FIXTURE_BOOTSTRAP');
const secondary = reference('SECONDARY_BOOTSTRAP');
const generated = { username: 'fixture', password: 'generated-secret' } as const;

it('persists one opaque bundle and resolves it from a fresh host instance', async () => {
  await withTempProjectAsync(async (projectPath) => {
    const first = createPort(projectPath);
    expect(await first.findAsync(bootstrap)).toEqual({ ok: true, value: null, diagnostics: [] });
    expect(await first.persistAsync(bootstrap, generated)).toEqual({
      ok: true,
      value: null,
      diagnostics: [],
    });

    const fresh = createPort(projectPath);
    expect(await fresh.resolveAsync(bootstrap)).toEqual({
      ok: true,
      value: generated,
      diagnostics: [],
    });
  });
});

it('keeps exact and prefixed environment overrides ahead of persisted state', async () => {
  await withTempProjectAsync(async (projectPath) => {
    const stored = createPort(projectPath);
    await stored.persistAsync(bootstrap, generated);

    const exact = createPort(projectPath, {
      FIXTURE_BOOTSTRAP: JSON.stringify({ username: 'exact', password: 'override' }),
      ANKH_INFRA_CREDENTIAL_FIXTURE_BOOTSTRAP: JSON.stringify({
        username: 'prefixed',
        password: 'override',
      }),
    });
    expect(await exact.resolveAsync(bootstrap)).toMatchObject({
      ok: true,
      value: { username: 'exact', password: 'override' },
    });

    const prefixed = createPort(projectPath, {
      ANKH_INFRA_CREDENTIAL_FIXTURE_BOOTSTRAP: JSON.stringify({
        username: 'prefixed',
        password: 'override',
      }),
    });
    expect(await prefixed.resolveAsync(bootstrap)).toMatchObject({
      ok: true,
      value: { username: 'prefixed', password: 'override' },
    });
  });
});

it('fails closed on malformed persisted state instead of treating it as missing', async () => {
  await withTempProjectAsync(async (projectPath) => {
    const port = createPort(projectPath);
    await port.persistAsync(bootstrap, generated);
    await fs.writeFile(credentialPath(projectPath, 'local', bootstrap.name), '{broken', 'utf8');

    const result = await createPort(projectPath).findAsync(bootstrap);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      {
        severity: 'error',
        code: 'infra-control-plane-credential-store-invalid',
        message:
          'Stored control-plane credential FIXTURE_BOOTSTRAP has an invalid project-state shape.',
      },
    ]);
  });
});

it('uses restrictive permissions and leaves no partial files after concurrent writes', async () => {
  await withTempProjectAsync(async (projectPath) => {
    const port = createPort(projectPath);
    await Promise.all([
      port.persistAsync(bootstrap, generated),
      port.persistAsync(secondary, { token: 'another-secret' }),
    ]);

    const directory = path.dirname(credentialPath(projectPath, 'local', bootstrap.name));
    const entries = await fs.readdir(directory);
    expect(entries.filter((entry) => entry.endsWith('.json'))).toHaveLength(2);
    expect(entries.some((entry) => entry.endsWith('.tmp'))).toBe(false);
    if (process.platform !== 'win32') {
      expect((await fs.stat(directory)).mode & 0o777).toBe(0o700);
      expect(
        (await fs.stat(credentialPath(projectPath, 'local', bootstrap.name))).mode & 0o777,
      ).toBe(0o600);
    }
  });
});

it('isolates persisted credentials by project and environment', async () => {
  await withTempProjectAsync(async (root) => {
    const projectA = path.join(root, 'a');
    const projectB = path.join(root, 'b');
    const local = createPort(projectA);
    const preview = createPort(projectA, {}, 'preview');
    const otherProject = createPort(projectB);
    await local.persistAsync(bootstrap, generated);

    expect(await local.resolveAsync(bootstrap)).toMatchObject({ ok: true, value: generated });
    expect(await preview.findAsync(bootstrap)).toEqual({ ok: true, value: null, diagnostics: [] });
    expect(await otherProject.findAsync(bootstrap)).toEqual({
      ok: true,
      value: null,
      diagnostics: [],
    });
  });
});

function createPort(
  projectPath: string,
  processEnvironment: Readonly<Record<string, string | undefined>> = {},
  environment: 'local' | 'preview' = 'local',
) {
  return createProjectInfraCredentialPort({ projectPath, environment, processEnvironment });
}

function reference(name: string): InfraControlPlaneCredentialRef {
  return { source: 'control-plane', name };
}

function credentialPath(
  projectPath: string,
  environment: 'local' | 'preview',
  name: string,
): string {
  const digest = createHash('sha256').update(name).digest('hex');
  return path.join(projectPath, '.ankh', 'infra', environment, 'credentials', `${digest}.json`);
}

async function withTempProjectAsync(run: (projectPath: string) => Promise<void>): Promise<void> {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ankh-infra-credentials-'));
  try {
    await run(projectPath);
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}
