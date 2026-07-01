import { afterEach, describe, expect, test } from 'bun:test';
import { promises as fs } from 'fs';
import os from 'os';
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

describe('resolveInfraProject', () => {
  test('resolves an explicit project id from the workspace root', async () => {
    const fixture = await createWorkspaceFixture();
    tempRoots.add(fixture.rootPath);

    const project = await resolveInfraProject({
      cwd: fixture.rootPath,
      projectId: fixture.projectId,
    });

    expect(project.projectId).toBe('shop');
    expect(project.projectPath).toBe(fixture.projectPath);
    expect(project.workspaceRoot).toBe(fixture.rootPath);
  });

  test('infers the project id from cwd inside apps/<project>', async () => {
    const fixture = await createWorkspaceFixture();
    tempRoots.add(fixture.rootPath);

    const nestedPath = path.join(fixture.projectPath, 'src', 'modules');
    await fs.mkdir(nestedPath, { recursive: true });

    const project = await resolveInfraProject({
      cwd: nestedPath,
    });

    expect(project.projectId).toBe('shop');
    expect(project.projectPath).toBe(fixture.projectPath);
  });

  test('loads the fallback manifest when ankh.config.json is missing', async () => {
    const fixture = await createWorkspaceFixture({
      manifestFile: 'missing',
    });
    tempRoots.add(fixture.rootPath);

    const project = await resolveInfraProject({
      cwd: fixture.rootPath,
      projectId: fixture.projectId,
    });

    expect(project.manifest.metadata.name).toBe('shop');
    expect(project.manifest.metadata.slug).toBe('shop');
    expect(project.manifest.infra.plugins).toEqual([]);
  });

  test('rejects malformed manifest JSON', async () => {
    const fixture = await createWorkspaceFixture({
      manifestFile: 'invalid-json',
    });
    tempRoots.add(fixture.rootPath);

    await expectRejectMessage(
      resolveInfraProject({
        cwd: fixture.rootPath,
        projectId: fixture.projectId,
      }),
      'Project manifest is not valid JSON',
    );
  });

  test('rejects traversal project ids', async () => {
    const fixture = await createWorkspaceFixture();
    tempRoots.add(fixture.rootPath);

    await expectRejectMessage(
      resolveInfraProject({
        cwd: fixture.rootPath,
        projectId: '../shop',
      }),
      'Invalid project id:',
    );
  });

  test('rejects explicit project ids with nested traversal segments', async () => {
    const fixture = await createWorkspaceFixture();
    tempRoots.add(fixture.rootPath);

    await expectRejectMessage(
      resolveInfraProject({
        cwd: fixture.rootPath,
        projectId: 'shop/../other',
      }),
      'Invalid project id:',
    );
  });

  test('rejects explicit absolute project ids', async () => {
    const fixture = await createWorkspaceFixture();
    tempRoots.add(fixture.rootPath);

    await expectRejectMessage(
      resolveInfraProject({
        cwd: fixture.rootPath,
        projectId: '/tmp/shop',
      }),
      'Invalid project id:',
    );
  });

  test('rejects explicit dot project ids', async () => {
    const fixture = await createWorkspaceFixture();
    tempRoots.add(fixture.rootPath);

    await expectRejectMessage(
      resolveInfraProject({
        cwd: fixture.rootPath,
        projectId: '.',
      }),
      'Invalid project id:',
    );
  });

  test('rejects explicit dot-dot project ids', async () => {
    const fixture = await createWorkspaceFixture();
    tempRoots.add(fixture.rootPath);

    await expectRejectMessage(
      resolveInfraProject({
        cwd: fixture.rootPath,
        projectId: '..',
      }),
      'Invalid project id:',
    );
  });

  test('rejects explicit empty project ids', async () => {
    const fixture = await createWorkspaceFixture();
    tempRoots.add(fixture.rootPath);

    await expectRejectMessage(
      resolveInfraProject({
        cwd: fixture.rootPath,
        projectId: '',
      }),
      'Invalid project id:',
    );
  });

  test('rejects explicit blank project ids', async () => {
    const fixture = await createWorkspaceFixture();
    tempRoots.add(fixture.rootPath);

    await expectRejectMessage(
      resolveInfraProject({
        cwd: fixture.rootPath,
        projectId: '   ',
      }),
      'Invalid project id:',
    );
  });

  test('fails when no workspace root can be found', async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-no-root-'));
    tempRoots.add(rootPath);

    await expectRejectMessage(
      resolveInfraProject({
        cwd: rootPath,
        projectId: 'shop',
      }),
      'Could not find an Ankh workspace root',
    );
  });

  test('reads a valid project manifest', async () => {
    const manifest = createAppManifest('cards', {
      deployment: {
        monitoring: false,
        target: 'minikube',
      },
      plugins: [],
    });
    const fixture = await createWorkspaceFixture({
      manifest,
      projectId: 'cards',
    });
    tempRoots.add(fixture.rootPath);

    const project = await resolveInfraProject({
      cwd: fixture.rootPath,
      projectId: 'cards',
    });

    expect(project.manifest.metadata.name).toBe('cards');
    expect(project.manifest.infra.deployment?.target).toBe('minikube');
  });
});

async function expectRejectMessage(promise: Promise<unknown>, text: string): Promise<void> {
  let didReject = false;

  try {
    await promise;
  } catch (error) {
    didReject = true;
    expect(error instanceof Error ? error.message : String(error)).toContain(text);
  }

  expect(didReject).toBe(true);
}
