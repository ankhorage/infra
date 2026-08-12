import { afterEach, describe, expect, test } from 'bun:test';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
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
    'APP_PORT_FORWARD_LOCAL_PORT=48123\n',
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
});
