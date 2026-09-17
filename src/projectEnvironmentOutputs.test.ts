import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  InfraEnvironmentSpec,
  InfraLedger,
  InfraOutput,
  InfraResult,
} from '@ankhorage/contracts/infra';
import { afterEach, expect, test } from 'bun:test';

import { up } from './cli/commands/up.js';
import { writeProjectEnvironmentOutputsAsync } from './features/environment-lifecycle/adapters/outbound/writeProjectEnvironmentOutputsAsync.js';
import { createInfraCommandServices } from './features/environment-lifecycle/composition/createInfraCommandServices.js';
import { createProjectInfraLifecycle } from './project/index.js';
import { createAppManifest, createCapturedCommandContext } from './testSupport.js';
import type { InfraLifecycleOperations } from './types/infraCli.js';
import type { InfraDestroyOperationRequest } from './types/infraOrchestration.js';

const temporaryPaths = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...temporaryPaths].map((entry) => fs.rm(entry, { force: true, recursive: true })),
  );
  temporaryPaths.clear();
});

test('project local up materializes only named public outputs and preserves unrelated env content', async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-project-env-'));
  temporaryPaths.add(projectPath);
  await fs.writeFile(
    path.join(projectPath, '.env.local'),
    '# existing\nUNCHANGED=value\nEXPO_PUBLIC_SUPABASE_URL=stale\nEXPO_PUBLIC_SUPABASE_URL=duplicate\n',
    'utf8',
  );

  const lifecycle = createProjectInfraLifecycle({
    services: {
      readState: () => Promise.resolve(null),
      writeState: () => Promise.resolve(),
      createDependencies: createDependencies,
      operations: createOperations(),
    },
  });
  const request = {
    projectId: 'sample',
    projectPath,
    manifest: { environments: { local: desired }, modules: [] },
    environment: 'local' as const,
  };

  expect((await lifecycle.upAsync(request)).ok).toBe(true);
  const first = await fs.readFile(path.join(projectPath, '.env.local'), 'utf8');
  expect(first).toBe(
    '# existing\nUNCHANGED=value\nEXPO_PUBLIC_SUPABASE_URL="https://supabase.example.test"\nEXPO_PUBLIC_SUPABASE_ANON_KEY="public-anon-key"\n',
  );
  expect(first).not.toContain('ignored-public-value');
  expect(first).not.toContain('database-password');

  expect((await lifecycle.upAsync(request)).ok).toBe(true);
  expect(await fs.readFile(path.join(projectPath, '.env.local'), 'utf8')).toBe(first);
});

test('non-local output materialization leaves the local app environment untouched', async () => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-project-env-'));
  temporaryPaths.add(projectPath);
  const environmentPath = path.join(projectPath, '.env.local');
  await fs.writeFile(environmentPath, 'UNCHANGED=value\n', 'utf8');

  await writeProjectEnvironmentOutputsAsync(projectPath, 'preview', outputs);

  expect(await fs.readFile(environmentPath, 'utf8')).toBe('UNCHANGED=value\n');
});

test('standalone up delegates local public output materialization through the shared service', async () => {
  const writes: {
    environment: string;
    outputs: readonly InfraOutput[];
    projectPath: string;
  }[] = [];
  const manifest = createAppManifest('sample', {
    environments: { local: desired },
    modules: [],
  });
  const services = createInfraCommandServices({
    resolveProject: () =>
      Promise.resolve({
        appsRoot: '/workspace/apps',
        workspaceRoot: '/workspace',
        manifestPath: '/workspace/apps/sample/ankh.config.json',
        projectId: 'sample',
        projectPath: '/workspace/apps/sample',
        manifest,
      }),
    readState: () => Promise.resolve(null),
    writeState: () => Promise.resolve(),
    writeEnvironmentOutputs: (projectPath, environment, resultOutputs) => {
      writes.push({ projectPath, environment, outputs: resultOutputs });
      return Promise.resolve();
    },
    createDependencies,
    operations: createOperations(),
  });
  const captured = createCapturedCommandContext('/workspace');

  const result = await up.run(
    {
      context: captured.context,
      arguments: {
        projectId: 'sample',
        environment: 'local',
        format: 'json',
        deleteResources: [],
      },
    },
    services,
  );

  expect(result.exitCode).toBe(0);
  expect(writes).toEqual([
    { projectPath: '/workspace/apps/sample', environment: 'local', outputs },
  ]);
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
  adapter: 'supabase',
  resourceId: 'runtime',
} as const;

const outputs = [
  {
    owner,
    name: 'url',
    visibility: 'public',
    value: 'https://supabase.example.test',
    environmentVariable: 'EXPO_PUBLIC_SUPABASE_URL',
  },
  {
    owner,
    name: 'anon-key',
    visibility: 'public',
    value: 'public-anon-key',
    environmentVariable: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  },
  {
    owner,
    name: 'ignored',
    visibility: 'public',
    value: 'ignored-public-value',
  },
  {
    owner,
    name: 'password',
    visibility: 'secret',
    reference: {
      source: 'secret-store',
      projectId: 'sample',
      environment: 'local',
      ref: 'database',
      key: 'database-password',
    },
  },
] as const satisfies readonly InfraOutput[];

const ledger = {
  schemaVersion: 1,
  projectId: 'sample',
  environment: 'local',
  targets: [],
  resources: [],
  outputs,
  artifacts: [],
} as const satisfies InfraLedger;

/*** Create deterministic project and command dependencies for environment-output tests. */
function createDependencies() {
  return {
    adapterResolver: { loadAsync: () => Promise.resolve({}) },
    credentials: { resolveAsync: () => Promise.resolve(success({})) },
    secrets: { resolveAsync: () => Promise.resolve(success('secret')) },
  };
}

/*** Create deterministic lifecycle operations that expose representative public and secret outputs. */
function createOperations(): InfraLifecycleOperations {
  return {
    validate: () => Promise.resolve(success({ environment: 'local' })),
    plan: (request) =>
      Promise.resolve(success({ projectId: request.projectId, environment: 'local', actions: [] })),
    generate: () => Promise.resolve(success({ environment: 'local', artifacts: [], ledger })),
    up: () =>
      Promise.resolve(
        success({ environment: 'local', targets: [], resources: [], outputs, ledger }),
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
    outputs: () => success({ environment: 'local', outputs }),
    down: () => Promise.resolve(success({ environment: 'local', ledger })),
    destroy: (request: InfraDestroyOperationRequest) =>
      Promise.resolve(success({ environment: request.environment ?? 'local', ledger: null })),
  };
}

/*** Create one successful Infra result for deterministic operation fakes. */
function success<T>(value: T): InfraResult<T> {
  return { ok: true, value, diagnostics: [] };
}
