import { afterEach, describe, expect, test } from 'bun:test';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { createAppManifest } from '../testSupport.js';
import {
  ensureProjectInfrastructureRuntime,
  inspectProjectInfrastructure,
  readProjectInfrastructureEnvironment,
  resolveProjectInfrastructureDatabaseUrl,
  resolveProjectInfrastructurePortForward,
  runProjectInfrastructureLifecycle,
} from './index.js';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((entry) => fs.rm(entry, { force: true, recursive: true })),
  );
});

async function createProjectFixture(): Promise<string> {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ankh-infra-project-'));
  temporaryPaths.push(projectPath);
  const infraRoot = path.join(projectPath, 'infra', 'minikube');
  const scriptsRoot = path.join(infraRoot, 'scripts');
  await fs.mkdir(scriptsRoot, { recursive: true });
  await fs.writeFile(
    path.join(scriptsRoot, 'status.sh'),
    "#!/usr/bin/env bash\nprintf 'status-ok'\nprintf 'status-warning' >&2\n",
    'utf8',
  );
  await fs.writeFile(
    path.join(infraRoot, '.env.example'),
    [
      'APP_PORT_FORWARD_LOCAL_PORT=48123',
      'SITE_URL=http://example.local',
      'DATABASE_URL=postgres://example',
      'PRIVATE_VALUE=not-selected',
      '',
    ].join('\n'),
    'utf8',
  );
  return projectPath;
}

describe('@ankhorage/infra/project', () => {
  test('executes generated lifecycle scripts without exposing script paths to consumers', async () => {
    const projectPath = await createProjectFixture();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runProjectInfrastructureLifecycle({
      projectId: 'example',
      projectPath,
      script: 'status',
      target: 'minikube',
      onStdout: (chunk) => stdout.push(chunk),
      onStderr: (chunk) => stderr.push(chunk),
    });

    expect(result).toEqual({ stdout: 'status-ok', stderr: 'status-warning' });
    expect(stdout.join('')).toBe('status-ok');
    expect(stderr.join('')).toBe('status-warning');
  });

  test('resolves the generated app port-forward endpoint through the owner API', async () => {
    const projectPath = await createProjectFixture();
    const result = await resolveProjectInfrastructurePortForward({
      projectPath,
      target: 'minikube',
    });

    expect(result).toEqual({
      localPort: 48123,
      url: 'http://127.0.0.1:48123',
    });
  });

  test('ensures the generated runtime port-forward group through the owner API', async () => {
    const projectPath = await createProjectFixture();
    const scriptPath = path.join(projectPath, 'infra', 'minikube', 'scripts', 'port-forward.sh');
    await fs.writeFile(scriptPath, '#!/usr/bin/env bash\nprintf \'%s\' "$*"\n', 'utf8');

    const result = await ensureProjectInfrastructureRuntime({
      projectId: 'example',
      projectPath,
      target: 'minikube',
    });

    expect(result).toEqual({ stdout: 'start runtime', stderr: '' });
  });

  test('reports actionable runtime-forward failures without reconciling infrastructure', async () => {
    const projectPath = await createProjectFixture();
    const scriptPath = path.join(projectPath, 'infra', 'minikube', 'scripts', 'port-forward.sh');
    await fs.writeFile(
      scriptPath,
      '#!/usr/bin/env bash\necho "app: target app/service/app-runtime not found"\nexit 1\n',
      'utf8',
    );

    await expectRejectMessage(
      ensureProjectInfrastructureRuntime({
        projectId: 'example',
        projectPath,
        target: 'minikube',
      }),
      "Failed to ensure infrastructure runtime for project 'example': app: target app/service/app-runtime not found",
    );
  });

  test('reads only requested runtime environment values from the generated fallback', async () => {
    const projectPath = await createProjectFixture();
    const result = await readProjectInfrastructureEnvironment({
      keys: ['SITE_URL', 'MISSING_VALUE'],
      projectPath,
      target: 'minikube',
    });

    expect(result).toEqual({ SITE_URL: 'http://example.local' });
  });

  test('prefers generated runtime environment and resolves the trusted database URL', async () => {
    const projectPath = await createProjectFixture();
    const envPath = path.join(projectPath, 'infra', 'minikube', '.env');
    await fs.writeFile(
      envPath,
      'SITE_URL=http://runtime.local\nDATABASE_URL=postgres://runtime\n',
      'utf8',
    );

    const environment = await readProjectInfrastructureEnvironment({
      keys: ['SITE_URL'],
      projectPath,
      target: 'minikube',
    });
    const databaseUrl = await resolveProjectInfrastructureDatabaseUrl({
      projectPath,
      target: 'minikube',
    });

    expect(environment).toEqual({ SITE_URL: 'http://runtime.local' });
    expect(databaseUrl).toBe('postgres://runtime');
  });

  test('inspects deployment and generated state through the owner ledger', async () => {
    const projectPath = await createProjectFixture();
    await fs.mkdir(path.join(projectPath, '.ankh'), { recursive: true });
    await fs.writeFile(
      path.join(projectPath, '.ankh', 'infra-ledger.json'),
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-08-12T04:00:00.000Z',
        target: 'minikube',
        files: ['infra/minikube/.env.example', 'infra/minikube/scripts/status.sh'],
        warnings: ['generated warning'],
      }),
      'utf8',
    );
    const manifest = createAppManifest('example', {
      deployment: { monitoring: false, target: 'minikube' },
      modules: [],
    });

    const result = await inspectProjectInfrastructure({
      manifest,
      projectId: 'example',
      projectPath,
    });

    expect(result).toEqual({
      generated: true,
      generatedAt: '2026-08-12T04:00:00.000Z',
      hasDeployment: true,
      target: 'minikube',
      trackedFiles: 2,
      warnings: ['generated warning'],
    });
  });
});

async function expectRejectMessage(
  promise: Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected operation to reject.');
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain(expectedMessage);
  }
}
