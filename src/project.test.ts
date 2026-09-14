import { afterEach, describe, expect, test } from 'bun:test';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { resolveInfraProjectAsync } from './features/environment-lifecycle/adapters/outbound/resolveInfraProjectAsync.js';
import { createWorkspaceFixture } from './testSupport.js';

const temporaryPaths = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...temporaryPaths].map((entry) => fs.rm(entry, { force: true, recursive: true })),
  );
  temporaryPaths.clear();
});

describe('project resolution', () => {
  test('resolves explicit and cwd-inferred projects with canonical manifests', async () => {
    const fixture = await createWorkspaceFixture();
    temporaryPaths.add(fixture.rootPath);
    const explicit = await resolveInfraProjectAsync({
      cwd: fixture.rootPath,
      projectId: fixture.projectId,
    });
    const inferred = await resolveInfraProjectAsync({ cwd: fixture.projectPath });
    expect(explicit.projectPath).toBe(fixture.projectPath);
    expect(inferred.projectId).toBe(fixture.projectId);
    expect(explicit.manifest.infra.environments.local.deployment.runtime.provider).toBe(
      'docker-compose',
    );
  });

  test('requires a real manifest and rejects malformed JSON', async () => {
    const missing = await createWorkspaceFixture({ manifestFile: 'missing' });
    const invalid = await createWorkspaceFixture({ manifestFile: 'invalid-json' });
    temporaryPaths.add(missing.rootPath);
    temporaryPaths.add(invalid.rootPath);
    expect(
      await captureError(resolveInfraProjectAsync({ cwd: missing.rootPath, projectId: 'shop' })),
    ).toContain('Project manifest not found');
    expect(
      await captureError(resolveInfraProjectAsync({ cwd: invalid.rootPath, projectId: 'shop' })),
    ).toContain('Project manifest is not valid JSON');
  });

  test('rejects traversal and projects outside an Ankh workspace', async () => {
    const fixture = await createWorkspaceFixture();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-outside-'));
    temporaryPaths.add(fixture.rootPath);
    temporaryPaths.add(outside);
    expect(
      await captureError(resolveInfraProjectAsync({ cwd: fixture.rootPath, projectId: '../shop' })),
    ).toContain('Invalid project id');
    expect(
      await captureError(resolveInfraProjectAsync({ cwd: outside, projectId: 'shop' })),
    ).toContain('Could not find an Ankh workspace root');
  });
});

async function captureError(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Expected operation to fail.');
}
