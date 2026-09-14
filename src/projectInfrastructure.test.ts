import type { InfraGeneratedArtifact, InfraLedger } from '@ankhorage/contracts/infra';
import { afterEach, describe, expect, test } from 'bun:test';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  readStoredInfraStateAsync,
  removeStoredInfraStateAsync,
  resolveProjectFile,
  writeInfraGeneratedArtifactsAsync,
  writeStoredInfraStateAsync,
} from './project/index.js';

const temporaryPaths = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...temporaryPaths].map((entry) => fs.rm(entry, { force: true, recursive: true })),
  );
  temporaryPaths.clear();
});

describe('project Infra state and artifacts', () => {
  test('persists environment-scoped desired state and a secret-safe ledger', async () => {
    const projectPath = await temporaryProject();
    await writeStoredInfraStateAsync(projectPath, {
      schemaVersion: 1,
      desired: desired,
      ledger: ledger([]),
    });
    expect(await readStoredInfraStateAsync(projectPath, 'local')).toEqual({
      schemaVersion: 1,
      desired,
      ledger: ledger([]),
    });
    await removeStoredInfraStateAsync(projectPath, 'local');
    expect(await readStoredInfraStateAsync(projectPath, 'local')).toBeNull();
  });

  test('writes deterministic artifacts and removes only previously tracked stale files', async () => {
    const projectPath = await temporaryProject();
    const unrelatedPath = path.join(projectPath, 'infra/unrelated.txt');
    await fs.mkdir(path.dirname(unrelatedPath), { recursive: true });
    await fs.writeFile(unrelatedPath, 'keep', 'utf8');
    const first = artifact('infra/compose.yaml', 'first');
    const stale = artifact('infra/stale.yaml', 'stale');
    await writeInfraGeneratedArtifactsAsync(projectPath, [first, stale], undefined);
    const result = await writeInfraGeneratedArtifactsAsync(
      projectPath,
      [artifact('infra/compose.yaml', 'second')],
      ledger([first, stale]),
    );
    expect(result).toEqual({ written: 1, removed: 1 });
    expect(await fs.readFile(path.join(projectPath, 'infra/compose.yaml'), 'utf8')).toBe('second');
    expect(await fs.readFile(unrelatedPath, 'utf8')).toBe('keep');
    expect(await fileExists(path.join(projectPath, 'infra/stale.yaml'))).toBe(false);
  });

  test('rejects traversal, state collisions and duplicate artifact paths before writing', async () => {
    const projectPath = await temporaryProject();
    expect(() => resolveProjectFile(projectPath, '../outside')).toThrow('outside project root');
    expect(() => resolveProjectFile(projectPath, '.ankh/infra/local/state.json')).toThrow(
      'Invalid generated Infra artifact path',
    );
    expect(
      await captureError(
        writeInfraGeneratedArtifactsAsync(
          projectPath,
          [artifact('infra/duplicate', 'a'), artifact('infra/duplicate', 'b')],
          undefined,
        ),
      ),
    ).toContain('Duplicate generated Infra artifact path');
    expect(await fileExists(path.join(projectPath, 'infra/duplicate'))).toBe(false);
  });

  test('fails closed when stored secret outputs contain a resolved value', async () => {
    const projectPath = await temporaryProject();
    const statePath = path.join(projectPath, '.ankh/infra/local/state.json');
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(
      statePath,
      JSON.stringify({
        schemaVersion: 1,
        desired,
        ledger: {
          ...ledger([]),
          outputs: [
            {
              owner: artifact('infra/example', '').owner,
              name: 'password',
              visibility: 'secret',
              value: 'must-not-be-accepted',
            },
          ],
        },
      }),
      'utf8',
    );
    expect(await captureError(readStoredInfraStateAsync(projectPath, 'local'))).toContain(
      'invalid shape',
    );
  });
});

const desired = {
  deployment: {
    compute: { provider: 'local' },
    runtime: { provider: 'docker-compose' },
  },
} as const;

function ledger(artifacts: readonly InfraGeneratedArtifact[]): InfraLedger {
  return {
    schemaVersion: 1,
    projectId: 'sample',
    environment: 'local',
    targets: [],
    resources: [],
    outputs: [],
    artifacts: artifacts.map(({ owner, path: artifactPath }) => ({ owner, path: artifactPath })),
  };
}

function artifact(artifactPath: string, content: string): InfraGeneratedArtifact {
  return {
    owner: {
      projectId: 'sample',
      environment: 'local',
      adapter: 'docker-compose',
      resourceId: 'runtime',
    },
    path: artifactPath,
    content,
  };
}

async function temporaryProject(): Promise<string> {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-project-'));
  temporaryPaths.add(projectPath);
  return projectPath;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function captureError(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Expected operation to fail.');
}
