import { renderProviderHelp } from '@ankhorage/ankh';
import type { AppManifest } from '@ankhorage/contracts';
import type { InfraEnvironmentSpec, InfraLedger, InfraResult } from '@ankhorage/contracts/infra';
import { describe, expect, test } from 'bun:test';

import { INFRA_COMMANDS } from './cli/constants.js';
import { createInfraRuntimeProvider } from './cli/createInfraRuntimeProvider.js';
import { createProviderCommandDescriptors } from './cli/createProviderCommandDescriptors.js';
import { findInfraCommand } from './cli/findInfraCommand.js';
import { runInfraCommandAsync } from './cli/runInfraCommandAsync.js';
import { INFRA_PACKAGE_DESCRIPTION } from './constants.js';
import { createAppManifest, createCapturedCommandContext } from './testSupport.js';
import type { InfraCommandServices, InfraLifecycleOperations } from './types/infraCli.js';
import type { InfraDestroyOperationRequest } from './types/infraOrchestration.js';

describe('canonical Infra commands', () => {
  test('exposes the same locked eight-command surface everywhere', () => {
    const names = ['validate', 'plan', 'generate', 'up', 'status', 'outputs', 'down', 'destroy'];
    expect(INFRA_COMMANDS.map(({ standaloneName }) => standaloneName)).toEqual(names);
    expect(createProviderCommandDescriptors().map(({ path }) => path.join(' '))).toEqual(names);
    const help = renderProviderHelp({
      commandPrefix: ['ankhorage-infra'],
      description: INFRA_PACKAGE_DESCRIPTION,
      manifest: createInfraRuntimeProvider(),
    });
    for (const name of names) expect(help).toContain(name);
    expect(help).not.toContain('port-forward');
    expect(help).not.toContain('reset');
  });

  test('prints environment output format without resolving or exposing secret values', async () => {
    const captured = createCapturedCommandContext('/workspace');
    const command = requireCommand('outputs');
    const result = await runInfraCommandAsync(
      { argv: ['shop', '--format', 'env'], command, context: captured.context },
      { services: createServices() },
    );
    expect(result.exitCode).toBe(0);
    expect(captured.stdout.value).toBe("PUBLIC_URL='https://example.test'\n");
    expect(captured.stderr.value).toContain('remains a reference and was not printed');
    expect(`${captured.stdout.value}${captured.stderr.value}`).not.toContain('resolved-secret');
  });

  test('requires explicit destroy environment and exact project confirmation', async () => {
    const command = requireCommand('destroy');
    const missingEnvironment = createCapturedCommandContext('/workspace');
    expect(
      (
        await runInfraCommandAsync(
          { argv: ['shop'], command, context: missingEnvironment.context },
          { services: createServices() },
        )
      ).exitCode,
    ).toBe(1);
    expect(missingEnvironment.stderr.value).toContain('requires --environment');

    const wrongConfirmation = createCapturedCommandContext('/workspace');
    expect(
      (
        await runInfraCommandAsync(
          {
            argv: ['shop', '--environment', 'local', '--confirm', 'other:local'],
            command,
            context: wrongConfirmation.context,
          },
          { services: createServices() },
        )
      ).exitCode,
    ).toBe(1);
    expect(wrongConfirmation.stderr.value).toContain('--confirm shop:local');
  });

  test('maps explicit persistent deletion only to an owned persistent resource', async () => {
    const requests: InfraDestroyOperationRequest[] = [];
    const captured = createCapturedCommandContext('/workspace');
    const result = await runInfraCommandAsync(
      {
        argv: [
          'shop',
          '--environment',
          'local',
          '--confirm',
          'shop:local',
          '--delete-resource',
          'supabase:database',
        ],
        command: requireCommand('destroy'),
        context: captured.context,
      },
      { services: createServices(requests) },
    );
    expect(result.exitCode).toBe(0);
    expect(requests[0]?.persistence).toEqual({
      policy: 'delete',
      confirmedResources: [ledger.resources[0].identity],
    });
  });
});

const desired = {
  deployment: {
    compute: { provider: 'local' },
    runtime: { provider: 'docker-compose' },
  },
} as const satisfies InfraEnvironmentSpec;

const ledger = {
  schemaVersion: 1,
  projectId: 'shop',
  environment: 'local',
  targets: [],
  resources: [
    {
      identity: {
        projectId: 'shop',
        environment: 'local',
        adapter: 'supabase',
        resourceId: 'database',
      },
      persistent: true,
      retention: 'retain',
      dependsOn: [],
    },
  ],
  outputs: [
    {
      owner: {
        projectId: 'shop',
        environment: 'local',
        adapter: 'docker-compose',
        resourceId: 'runtime',
      },
      name: 'url',
      visibility: 'public',
      value: 'https://example.test',
      environmentVariable: 'PUBLIC_URL',
    },
    {
      owner: {
        projectId: 'shop',
        environment: 'local',
        adapter: 'supabase-vault',
        resourceId: 'vault',
      },
      name: 'password',
      visibility: 'secret',
      reference: {
        source: 'secret-store',
        projectId: 'shop',
        environment: 'local',
        ref: 'database',
        key: 'password',
      },
    },
  ],
  artifacts: [],
} as const satisfies InfraLedger;

function createServices(
  destroyRequests: InfraDestroyOperationRequest[] = [],
): Partial<InfraCommandServices> {
  const manifest: AppManifest = createAppManifest('shop', {
    environments: { local: desired },
    modules: [],
  });
  return {
    resolveProject: () =>
      Promise.resolve({
        appsRoot: '/workspace/apps',
        workspaceRoot: '/workspace',
        manifestPath: '/workspace/apps/shop/ankh.config.json',
        projectId: 'shop',
        projectPath: '/workspace/apps/shop',
        manifest,
      }),
    readState: () => Promise.resolve({ schemaVersion: 1, desired, ledger }),
    writeState: () => Promise.resolve(),
    removeState: () => Promise.resolve(),
    writeArtifacts: () => Promise.resolve({ written: 0, removed: 0 }),
    createDependencies: () => ({
      adapterResolver: { loadAsync: () => Promise.resolve({}) },
      credentials: { resolveAsync: () => Promise.resolve(success({})) },
      secrets: { resolveAsync: () => Promise.resolve(success('resolved-secret')) },
    }),
    operations: createOperations(destroyRequests),
  };
}

function createOperations(
  destroyRequests: InfraDestroyOperationRequest[],
): InfraLifecycleOperations {
  return {
    validate: () => Promise.resolve(success({ environment: 'local' })),
    plan: (request) =>
      Promise.resolve(success({ projectId: request.projectId, environment: 'local', actions: [] })),
    generate: () => Promise.resolve(success({ environment: 'local', artifacts: [], ledger })),
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

function requireCommand(name: string) {
  const command = findInfraCommand(name);
  if (command === null) throw new Error(`Missing command: ${name}`);
  return command;
}

function success<T>(value: T): InfraResult<T> {
  return { ok: true, value, diagnostics: [] };
}
