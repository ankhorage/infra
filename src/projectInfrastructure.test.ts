import { afterEach, describe, expect, test } from 'bun:test';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  resolveProjectFile,
  resolveProjectInfrastructureTarget,
  syncProjectInfrastructure,
} from './projectInfrastructure.js';
import { createAppManifest } from './testSupport.js';

const tempRoots = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...tempRoots].map((rootPath) => fs.rm(rootPath, { force: true, recursive: true })),
  );
  tempRoots.clear();
});

describe('project infrastructure sync', () => {
  test('writes generated files and the infra ledger', async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-sync-'));
    tempRoots.add(projectPath);

    const result = await syncProjectInfrastructure({
      projectId: 'shop',
      projectPath,
      manifest: createAppManifest('shop', {
        deployment: { target: 'minikube', monitoring: false },
        plugins: [],
      }),
      generateInfrastructureImpl() {
        return {
          files: [
            {
              path: 'infra/minikube/scripts/status.sh',
              content: '#!/usr/bin/env bash\n',
              executable: true,
            },
            { path: 'infra/minikube/.env.example', content: 'APP_PORT=1\n' },
          ],
          warnings: ['generated warning'],
          meta: {
            target: 'minikube',
            providers: [],
          },
          dependencies: [],
        };
      },
    });

    expect(result.generated).toBe(2);
    expect(result.removed).toBe(0);
    expect(result.warnings).toEqual(['generated warning']);
    expect(await fs.readFile(path.join(projectPath, 'infra/minikube/.env.example'), 'utf8')).toBe(
      'APP_PORT=1\n',
    );

    const ledger = JSON.parse(
      await fs.readFile(path.join(projectPath, '.ankh/infra-ledger.json'), 'utf8'),
    ) as {
      readonly target: string;
      readonly files: readonly string[];
    };
    expect(ledger.target).toBe('minikube');
    expect(ledger.files).toEqual([
      'infra/minikube/.env.example',
      'infra/minikube/scripts/status.sh',
    ]);
  });

  test('removes stale files when regeneration shrinks the output set', async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-stale-'));
    tempRoots.add(projectPath);

    const manifest = createAppManifest('shop', {
      deployment: { target: 'minikube', monitoring: false },
      plugins: [],
    });

    await syncProjectInfrastructure({
      projectId: 'shop',
      projectPath,
      manifest,
      generateInfrastructureImpl() {
        return {
          files: [
            { path: 'infra/minikube/scripts/status.sh', content: 'first' },
            { path: 'infra/minikube/scripts/up.sh', content: 'extra' },
          ],
          warnings: [],
          meta: { target: 'minikube', providers: [] },
          dependencies: [],
        };
      },
    });

    const result = await syncProjectInfrastructure({
      projectId: 'shop',
      projectPath,
      manifest,
      generateInfrastructureImpl() {
        return {
          files: [{ path: 'infra/minikube/scripts/status.sh', content: 'second' }],
          warnings: [],
          meta: { target: 'minikube', providers: [] },
          dependencies: [],
        };
      },
    });

    expect(result.removed).toBe(1);
    expect(await pathExists(path.join(projectPath, 'infra/minikube/scripts/up.sh'))).toBe(false);
  });

  test('cleans generated files when deployment is removed', async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-clean-'));
    tempRoots.add(projectPath);

    await fs.mkdir(path.join(projectPath, '.ankh'), { recursive: true });
    await fs.mkdir(path.join(projectPath, 'infra/minikube/scripts'), { recursive: true });
    await fs.writeFile(
      path.join(projectPath, 'infra/minikube/scripts/status.sh'),
      'status',
      'utf8',
    );
    await fs.writeFile(
      path.join(projectPath, '.ankh/infra-ledger.json'),
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        target: 'minikube',
        files: ['infra/minikube/scripts/status.sh'],
        warnings: [],
      }),
      'utf8',
    );

    const result = await syncProjectInfrastructure({
      projectId: 'shop',
      projectPath,
      manifest: createAppManifest('shop', { plugins: [] }),
    });

    expect(result.generated).toBe(0);
    expect(result.removed).toBe(1);
    expect(await pathExists(path.join(projectPath, '.ankh/infra-ledger.json'))).toBe(false);
  });

  test('preserves apps/studio skip behavior', async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-studio-'));
    tempRoots.add(projectPath);

    const result = await syncProjectInfrastructure({
      projectId: 'studio',
      projectPath,
      manifest: createAppManifest('studio', {
        deployment: { target: 'minikube', monitoring: false },
        plugins: [],
      }),
    });

    expect(result.skipped?.reason).toContain('apps/studio');
  });

  test('resolves targets from the ledger when deployment metadata is absent', async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-target-'));
    tempRoots.add(projectPath);

    await fs.mkdir(path.join(projectPath, '.ankh'), { recursive: true });
    await fs.writeFile(
      path.join(projectPath, '.ankh/infra-ledger.json'),
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        target: 'minikube',
        files: [],
        warnings: [],
      }),
      'utf8',
    );

    const target = await resolveProjectInfrastructureTarget({
      manifest: createAppManifest('shop', { plugins: [] }),
      projectPath,
    });

    expect(target).toBe('minikube');
  });

  test('rejects generated file paths outside the project root', () => {
    expect(() => resolveProjectFile('/workspace/project', '../outside.txt')).toThrow(
      'Invalid infra output path outside project root',
    );
  });
});

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
