import { afterEach, describe, expect, test } from 'bun:test';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  InfraScriptExecutionError,
  resolveProjectInfraScriptPath,
  runProjectInfraScript,
} from './runtime.js';
import { createCapturedCommandContext } from './testSupport.js';

const tempRoots = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...tempRoots].map((rootPath) => fs.rm(rootPath, { force: true, recursive: true })),
  );
  tempRoots.clear();
});

describe('runtime scripts', () => {
  test('resolves minikube lifecycle scripts under the project infra directory', () => {
    expect(
      resolveProjectInfraScriptPath({
        projectPath: '/workspace/apps/shop',
        script: 'status',
        target: 'minikube',
      }),
    ).toBe('/workspace/apps/shop/infra/minikube/scripts/status.sh');
  });

  test('streams script output to the command context', async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-runtime-'));
    tempRoots.add(projectPath);
    const scriptDir = path.join(projectPath, 'infra/minikube/scripts');
    await fs.mkdir(scriptDir, { recursive: true });
    await fs.writeFile(
      path.join(scriptDir, 'status.sh'),
      '#!/usr/bin/env bash\necho status-ok\necho status-warn 1>&2\n',
      'utf8',
    );

    const captured = createCapturedCommandContext(projectPath);

    await runProjectInfraScript({
      context: captured.context,
      projectId: 'shop',
      projectPath,
      script: 'status',
      target: 'minikube',
    });

    expect(captured.stdout.value).toContain('status-ok');
    expect(captured.stderr.value).toContain('status-warn');
  });

  test('reports missing scripts clearly', async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-missing-'));
    tempRoots.add(projectPath);
    const captured = createCapturedCommandContext(projectPath);

    await expectRejectMessage(
      runProjectInfraScript({
        context: captured.context,
        projectId: 'shop',
        projectPath,
        script: 'up',
        target: 'minikube',
      }),
      'Run infra generate for project',
    );
  });

  test('wraps non-zero script exits in InfraScriptExecutionError', async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-error-'));
    tempRoots.add(projectPath);
    const scriptDir = path.join(projectPath, 'infra/minikube/scripts');
    await fs.mkdir(scriptDir, { recursive: true });
    await fs.writeFile(
      path.join(scriptDir, 'down.sh'),
      '#!/usr/bin/env bash\necho boom 1>&2\nexit 7\n',
      'utf8',
    );

    const captured = createCapturedCommandContext(projectPath);

    try {
      await runProjectInfraScript({
        context: captured.context,
        projectId: 'shop',
        projectPath,
        script: 'down',
        target: 'minikube',
      });
      throw new Error('Expected runtime script to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(InfraScriptExecutionError);
    }
  });

  test('rejects unsupported deployment targets', () => {
    expect(() =>
      resolveProjectInfraScriptPath({
        projectPath: '/workspace/apps/shop',
        script: 'status',
        target: 'aws',
      }),
    ).toThrow('Unsupported deployment target for infra scripts');
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
