import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { InfraEnvironmentSpec, InfraLedger, InfraResult } from '@ankhorage/contracts/infra';
import { afterEach, expect, test } from 'bun:test';

import { createProjectInfraLifecycle, readStoredInfraStateAsync } from './project/index.js';
import type { InfraLifecycleOperations } from './types/infraCli.js';
import type { InfraDestroyOperationRequest } from './types/infraOrchestration.js';

const temporaryPaths = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...temporaryPaths].map((entry) => fs.rm(entry, { force: true, recursive: true })),
  );
  temporaryPaths.clear();
});

test('runs typed project lifecycle operations with canonical state and artifact ownership', async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-project-lifecycle-'));
  temporaryPaths.add(projectPath);
  const destroyRequests: InfraDestroyOperationRequest[] = [];
  const lifecycle = createProjectInfraLifecycle({
    services: {
      createDependencies: () => ({
        adapterResolver: { loadAsync: () => Promise.resolve({}) },
        credentials: { resolveAsync: () => Promise.resolve(success({})) },
        secrets: { resolveAsync: () => Promise.resolve(success('secret')) },
      }),
      operations: createOperations(destroyRequests),
    },
  });
  const request = {
    projectId: 'sample',
    projectPath,
    manifest: { environments: { local: desired }, modules: [] },
    environment: 'local' as const,
  };

  const generated = await lifecycle.generateAsync(request);
  expect(generated.ok).toBe(true);
  expect(await fs.readFile(path.join(projectPath, 'infra/example.txt'), 'utf8')).toBe('generated');
  expect((await readStoredInfraStateAsync(projectPath, 'local'))?.ledger).toEqual(ledger);

  const outputs = await lifecycle.outputsAsync(request);
  expect(outputs.ok && outputs.value.outputs).toEqual(ledger.outputs);

  const destroyed = await lifecycle.destroyAsync({
    ...request,
    confirmation: { projectId: 'sample', environment: 'local' },
    persistence: { policy: 'retain' },
  });
  expect(destroyed.ok).toBe(true);
  expect(destroyRequests[0]?.confirmation).toEqual({ projectId: 'sample', environment: 'local' });
  expect(await readStoredInfraStateAsync(projectPath, 'local')).toBeNull();
  expect(await fileExists(path.join(projectPath, 'infra/example.txt'))).toBe(false);
});

const desired = {
  deployment: {
    compute: { provider: 'local' },
    runtime: { provider: 'docker-compose' },
  },
} as const satisfies InfraEnvironmentSpec;

const owner = {
  projectId: 'sample',
  environment: 'local',
  adapter: 'docker-compose',
  resourceId: 'runtime',
} as const;

const ledger = {
  schemaVersion: 1,
  projectId: 'sample',
  environment: 'local',
  targets: [],
  resources: [],
  outputs: [{ owner, name: 'url', visibility: 'public', value: 'https://example.test' }],
  artifacts: [{ owner, path: 'infra/example.txt' }],
} as const satisfies InfraLedger;

/*** Create deterministic operation fakes while recording destructive authorization. */
function createOperations(
  destroyRequests: InfraDestroyOperationRequest[],
): InfraLifecycleOperations {
  return {
    validate: () => Promise.resolve(success({ environment: 'local' })),
    plan: (request) =>
      Promise.resolve(success({ projectId: request.projectId, environment: 'local', actions: [] })),
    generate: () =>
      Promise.resolve(
        success({
          environment: 'local',
          artifacts: [{ owner, path: 'infra/example.txt', content: 'generated' }],
          ledger,
        }),
      ),
    up: () =>
      Promise.resolve(
        success({ environment: 'local', targets: [], resources: [], outputs: [], ledger }),
      ),
    status: (request) =>
      Promise.resolve(
        success({
          projectId: request.projectId,
          environment: 'local',
          state: 'ready',
          resources: [],
        }),
      ),
    outputs: () => success({ environment: 'local', outputs: ledger.outputs }),
    down: () => Promise.resolve(success({ environment: 'local', ledger })),
    destroy: (request) => {
      destroyRequests.push(request);
      return Promise.resolve(success({ environment: 'local', ledger: null }));
    },
  };
}

/*** Create one successful Infra result for operation fakes. */
function success<T>(value: T): InfraResult<T> {
  return { ok: true, value, diagnostics: [] };
}

/*** Report whether a generated artifact still exists. */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
