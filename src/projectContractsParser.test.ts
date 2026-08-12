import { afterEach, expect, test } from 'bun:test';
import { promises as fs } from 'fs';
import path from 'path';

import { resolveInfraProject } from './project.js';
import { createAppManifest, createWorkspaceFixture } from './testSupport.js';

const tempRoots = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...tempRoots].map((rootPath) => fs.rm(rootPath, { force: true, recursive: true })),
  );
  tempRoots.clear();
});

test('Infra rejects nested manifest shapes rejected by Contracts', async () => {
  const manifest = createAppManifest('cards', { modules: [] });
  const [theme] = manifest.themes;
  const fixture = await createWorkspaceFixture({ manifest, projectId: 'cards' });
  tempRoots.add(fixture.rootPath);

  const malformedManifest = {
    ...manifest,
    themes: theme
      ? [
          {
            ...theme,
            light: { ...theme.light, harmony: 'not-a-canonical-harmony' },
          },
        ]
      : [],
  };
  await fs.writeFile(
    path.join(fixture.projectPath, 'ankh.config.json'),
    JSON.stringify(malformedManifest),
    'utf8',
  );

  const error = await captureError(
    resolveInfraProject({ cwd: fixture.rootPath, projectId: fixture.projectId }),
  );
  expect(error.message).toContain('Project manifest has an invalid shape');
});

async function captureError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error('Expected project resolution to reject.');
}
