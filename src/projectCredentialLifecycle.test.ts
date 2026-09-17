import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  InfraControlPlaneCredentialRef,
  InfraEnvironmentSpec,
  InfraLedger,
  InfraResult,
} from '@ankhorage/contracts/infra';
import { expect, it, mock } from 'bun:test';

import { createProjectInfraCredentialPort } from './features/environment-lifecycle/adapters/outbound/createProjectInfraCredentialPort.js';
import { createProjectInfraLifecycle } from './project/index.js';
import type { InfraLifecycleOperations } from './types/infraCli.js';

const bootstrap = {
  source: 'control-plane',
  name: 'FIXTURE_BOOTSTRAP',
} as const satisfies InfraControlPlaneCredentialRef;
const generated = { username: 'fixture', password: 'generated-secret' } as const;
const previewGenerated = { username: 'preview', password: 'preview-secret' } as const;

const desired = {
  deployment: {
    compute: { provider: 'local' },
    runtime: { provider: 'docker-compose' },
  },
} as const satisfies InfraEnvironmentSpec;

const ledger = {
  schemaVersion: 1,
  projectId: 'sample',
  environment: 'local',
  targets: [],
  resources: [],
  outputs: [],
  artifacts: [],
} as const satisfies InfraLedger;

it('persists provider-created credentials across up/down and removes only the destroyed environment', async () => {
  await withTempProjectAsync(async (projectPath) => {
    const generateCredential = mock(() => generated);
    const operations = createCredentialOperations(generateCredential);
    const request = {
      projectId: 'sample',
      projectPath,
      manifest: { environments: { local: desired, preview: desired }, modules: [] },
      environment: 'local' as const,
      executionEnvironment: {},
    };

    const firstLifecycle = createProjectInfraLifecycle({ services: { operations } });
    const firstUp = await firstLifecycle.upAsync(request);
    expect(firstUp.ok).toBe(true);
    expect(generateCredential).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(firstUp)).not.toContain('generated-secret');
    expect(await fs.readFile(statePath(projectPath, 'local'), 'utf8')).not.toContain(
      'generated-secret',
    );

    const down = await firstLifecycle.downAsync(request);
    expect(down.ok).toBe(true);
    expect(await createPort(projectPath, 'local').resolveAsync(bootstrap)).toMatchObject({
      ok: true,
      value: generated,
    });

    const secondLifecycle = createProjectInfraLifecycle({ services: { operations } });
    const secondUp = await secondLifecycle.upAsync(request);
    expect(secondUp.ok).toBe(true);
    expect(generateCredential).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(secondUp)).not.toContain('generated-secret');

    const previewPort = createPort(projectPath, 'preview');
    expect(await previewPort.persistAsync(bootstrap, previewGenerated)).toMatchObject({ ok: true });

    const destroyed = await secondLifecycle.destroyAsync({
      ...request,
      confirmation: { projectId: 'sample', environment: 'local' },
      persistence: { policy: 'retain' },
    });
    expect(destroyed.ok).toBe(true);
    expect(await createPort(projectPath, 'local').findAsync(bootstrap)).toEqual({
      ok: true,
      value: null,
      diagnostics: [],
    });
    expect(await previewPort.resolveAsync(bootstrap)).toMatchObject({
      ok: true,
      value: previewGenerated,
    });
  });
});

/*** Create provider-neutral operation fixtures that generate credentials only when lookup is missing. */
function createCredentialOperations(
  generateCredential: () => Readonly<Record<string, string>>,
): InfraLifecycleOperations {
  return {
    validate: () => Promise.resolve(success({ environment: 'local' })),
    plan: (request) =>
      Promise.resolve(success({ projectId: request.projectId, environment: 'local', actions: [] })),
    generate: () => Promise.resolve(success({ environment: 'local', artifacts: [], ledger })),
    up: async (_request, dependencies) => {
      const found = await dependencies.credentials.findAsync(bootstrap);
      if (!found.ok) return { ok: false, diagnostics: found.diagnostics };
      if (found.value === null) {
        const persisted = await dependencies.credentials.persistAsync(
          bootstrap,
          generateCredential(),
        );
        if (!persisted.ok) return { ok: false, diagnostics: persisted.diagnostics };
      }
      return success({
        environment: 'local',
        targets: [],
        resources: [],
        outputs: [],
        ledger,
      });
    },
    status: (request) =>
      Promise.resolve(
        success({
          projectId: request.projectId,
          environment: 'local',
          state: 'ready',
          resources: [],
        }),
      ),
    outputs: () => success({ environment: 'local', outputs: [] }),
    down: () => Promise.resolve(success({ environment: 'local', ledger })),
    destroy: () => Promise.resolve(success({ environment: 'local', ledger: null })),
  };
}

/*** Create the real project-local credential adapter for one isolated test environment. */
function createPort(projectPath: string, environment: 'local' | 'preview') {
  return createProjectInfraCredentialPort({ projectPath, environment, processEnvironment: {} });
}

/*** Resolve the canonical Infra ownership-state path without touching credential storage internals. */
function statePath(projectPath: string, environment: 'local' | 'preview'): string {
  return path.join(projectPath, '.ankh', 'infra', environment, 'state.json');
}

/*** Create one successful Infra result for operation fixtures. */
function success<T>(value: T): InfraResult<T> {
  return { ok: true, value, diagnostics: [] };
}

/*** Run one filesystem test against a disposable project root. */
async function withTempProjectAsync(run: (projectPath: string) => Promise<void>): Promise<void> {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ankh-infra-credential-lifecycle-'));
  try {
    await run(projectPath);
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}
