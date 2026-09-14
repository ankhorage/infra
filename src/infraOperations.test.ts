import type {
  InfraAdapterDescriptor,
  InfraComputeAdapter,
  InfraEnvironmentSpec,
  InfraOwnedResource,
  InfraPlanAction,
  InfraResourceIdentity,
  InfraResourceStatus,
  InfraResult,
  InfraRuntimeAdapter,
  InfraServiceAdapter,
  InfraWorkloadSpec,
} from '@ankhorage/contracts/infra';
import { INFRA_ADAPTER_CATALOG } from '@ankhorage/contracts/infra';
import { describe, expect, it } from 'bun:test';

import type { InfraAdapterPackageResolver } from './features/environment-lifecycle/application/ports/outbound/infraAdapterPackage';
import { destroyInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/destroyInfraEnvironmentAsync';
import { downInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/downInfraEnvironmentAsync';
import { generateInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/generateInfraEnvironmentAsync';
import { getInfraEnvironmentOutputs } from './features/environment-lifecycle/application/use-cases/getInfraEnvironmentOutputs';
import { planInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/planInfraEnvironmentAsync';
import { statusInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/statusInfraEnvironmentAsync';
import { validateInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/validateInfraEnvironmentAsync';
import type { InfraOrchestrationDependencies } from './types/infraOrchestration';

const desired = {
  deployment: { compute: { provider: 'local' }, runtime: { provider: 'docker-compose' } },
  database: { provider: 'supabase' },
  secretStore: { provider: 'supabase-vault' },
} as const satisfies InfraEnvironmentSpec;
const manifest = { environments: { local: desired }, modules: [] } as const;
const computeOwner = owner('local', 'host');
const runtimeOwner = owner('docker-compose', 'runtime');
const databaseOwner = owner('supabase', 'database');
const vaultOwner = owner('supabase-vault', 'vault');

describe('provider-neutral lifecycle operations', () => {
  it('validates and plans without calling a mutating adapter method', async () => {
    const calls: string[] = [];
    const dependencies = createDependencies(calls);
    const validation = await validateInfraEnvironmentAsync(
      { projectId: 'sample', manifest },
      dependencies,
    );
    const plan = await planInfraEnvironmentAsync({ projectId: 'sample', manifest }, dependencies);

    expect(validation).toMatchObject({ ok: true, value: { environment: 'local' } });
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('Expected plan.');
    expect(plan.value.actions.map(({ owner: actionOwner }) => actionOwner.resourceId)).toEqual([
      'host',
      'runtime',
      'database',
      'vault',
    ]);
    expect(calls).toContain('local.inspect');
    expect(calls.some((call) => call.endsWith('.ensure'))).toBe(false);
    expect(calls.some((call) => call.endsWith('.reconcile'))).toBe(false);
    expect(calls.some((call) => call.endsWith('.destroy'))).toBe(false);
  });

  it('plans fresh remote compute and a deferred runtime without inventing an SSH target', async () => {
    const calls: string[] = [];
    const remoteManifest = {
      environments: {
        local: desired,
        production: {
          deployment: {
            compute: { provider: 'hetzner', location: 'nbg1' },
            runtime: { provider: 'k3s', topology: { servers: 1, agents: 0 } },
          },
        },
      },
      modules: [],
    } as const;
    const result = await planInfraEnvironmentAsync(
      { projectId: 'sample', manifest: remoteManifest, environment: 'production' },
      createDependencies(calls),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected remote plan.');
    expect(result.value.actions.map(({ owner: actionOwner }) => actionOwner.adapter)).toEqual([
      'hetzner',
      'k3s',
    ]);
    expect(result.value.actions[1]?.detail).toContain('deferred');
    expect(calls).not.toContain('k3s.validate');
    expect(calls).not.toContain('k3s.plan');
  });

  it('generates review artifacts without reconciliation and preserves safe state', async () => {
    const calls: string[] = [];
    const result = await generateInfraEnvironmentAsync(
      { projectId: 'sample', manifest, previous: ledger() },
      createDependencies(calls),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected generation.');
    expect(result.value.artifacts).toEqual([
      { owner: runtimeOwner, path: 'infra/compose.yaml', content: 'services: {}\n' },
    ]);
    expect(result.value.ledger.outputs).toEqual(ledger().outputs);
    expect(calls).toContain('docker-compose.generate');
    expect(calls.some((call) => call.endsWith('.ensure'))).toBe(false);
  });

  it('aggregates canonical status and returns only serialized ledger outputs', async () => {
    const calls: string[] = [];
    const status = await statusInfraEnvironmentAsync(
      { projectId: 'sample', manifest, previous: ledger() },
      createDependencies(calls),
    );
    const outputs = getInfraEnvironmentOutputs({
      projectId: 'sample',
      manifest,
      previous: ledger(),
    });

    expect(status).toMatchObject({ ok: true, value: { state: 'degraded' } });
    expect(outputs).toMatchObject({
      ok: true,
      value: {
        outputs: [
          { visibility: 'public', value: 'https://example.test' },
          { visibility: 'secret', reference: { source: 'secret-store' } },
        ],
      },
    });
    expect(JSON.stringify(outputs)).not.toContain('resolved-secret');
  });

  it('suspends optional services in reverse dependency order before runtime', async () => {
    const calls: string[] = [];
    const result = await downInfraEnvironmentAsync(
      { projectId: 'sample', manifest, previous: ledger() },
      createDependencies(calls),
    );

    expect(result.ok).toBe(true);
    expect(calls.filter((call) => call.endsWith('.suspend'))).toEqual([
      'supabase-vault.suspend',
      'supabase.suspend',
      'docker-compose.suspend',
    ]);
    if (!result.ok) throw new Error('Expected down.');
    expect(result.value.ledger.resources).toHaveLength(4);
  });

  it('refuses mismatched destroy confirmation and destroys in reverse dependency order', async () => {
    const rejectedCalls: string[] = [];
    const rejected = await destroyInfraEnvironmentAsync(
      {
        projectId: 'sample',
        manifest,
        environment: 'local',
        previous: ledger(),
        confirmation: { projectId: 'other', environment: 'local' },
        persistence: { policy: 'retain' },
      },
      createDependencies(rejectedCalls),
    );
    expect(rejected).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'infra-destroy-confirmation-mismatch' }],
    });
    expect(rejectedCalls.some((call) => call.endsWith('.destroy'))).toBe(false);

    const calls: string[] = [];
    const result = await destroyInfraEnvironmentAsync(
      {
        projectId: 'sample',
        manifest,
        environment: 'local',
        previous: ledger(),
        confirmation: { projectId: 'sample', environment: 'local' },
        persistence: { policy: 'retain' },
      },
      createDependencies(calls),
    );
    expect(result.ok).toBe(true);
    expect(calls.filter((call) => call.endsWith('.destroy'))).toEqual([
      'supabase-vault.destroy',
      'supabase.destroy',
      'docker-compose.destroy',
      'local.destroy',
    ]);
  });
});

function createDependencies(calls: string[]): InfraOrchestrationDependencies {
  return {
    adapterResolver: createResolver(calls),
    credentials: { resolveAsync: () => Promise.resolve(success({})) },
    secrets: { resolveAsync: () => Promise.resolve(success('resolved-secret')) },
  };
}

function createResolver(calls: string[]): InfraAdapterPackageResolver {
  return {
    loadAsync(packageName) {
      const descriptor = descriptorForPackage(packageName);
      return Promise.resolve({
        infraAdapterDescriptor: descriptor,
        createInfraAdapter: () => createAdapter(descriptor, calls),
      });
    },
  };
}

function createAdapter(descriptor: InfraAdapterDescriptor, calls: string[]): unknown {
  if (descriptor.kind === 'compute') return createCompute(descriptor, calls);
  if (descriptor.kind === 'runtime') return createRuntime(descriptor, calls);
  return createService(descriptor, calls);
}

function createCompute(descriptor: InfraAdapterDescriptor, calls: string[]): InfraComputeAdapter {
  const selectedOwner = descriptor.id === 'hetzner' ? owner('hetzner', 'server') : computeOwner;
  return {
    descriptor: descriptor as InfraComputeAdapter['descriptor'],
    validateAsync: () => recordedAsync(calls, `${descriptor.id}.validate`, null),
    inspectAsync: () =>
      recordedAsync(calls, `${descriptor.id}.inspect`, {
        targets:
          descriptor.id === 'hetzner'
            ? []
            : [{ id: 'local', kind: 'local-host', os: 'linux', architecture: 'amd64' }],
        resources: [resource(selectedOwner)],
        outputs: [],
      }),
    planAsync: () => recordedAsync(calls, `${descriptor.id}.plan`, [action(selectedOwner, [])]),
    ensureAsync: () =>
      recordedAsync(calls, `${descriptor.id}.ensure`, { targets: [], resources: [], outputs: [] }),
    statusAsync: () =>
      recordedAsync(calls, `${descriptor.id}.status`, [status(selectedOwner, 'ready')]),
    destroyAsync: () =>
      recordedAsync(calls, `${descriptor.id}.destroy`, { resources: [], outputs: [] }),
  };
}

function createRuntime(descriptor: InfraAdapterDescriptor, calls: string[]): InfraRuntimeAdapter {
  return {
    descriptor: descriptor as InfraRuntimeAdapter['descriptor'],
    validateAsync: () => recordedAsync(calls, `${descriptor.id}.validate`, null),
    planAsync: () =>
      recordedAsync(calls, `${descriptor.id}.plan`, [action(runtimeOwner, [computeOwner])]),
    ensureAsync: () =>
      recordedAsync(calls, `${descriptor.id}.ensure`, { resources: [], outputs: [] }),
    statusAsync: () =>
      recordedAsync(calls, `${descriptor.id}.status`, [status(runtimeOwner, 'degraded')]),
    suspendAsync: () =>
      recordedAsync(calls, `${descriptor.id}.suspend`, {
        resources: [resource(runtimeOwner)],
        outputs: [],
      }),
    destroyAsync: () =>
      recordedAsync(calls, `${descriptor.id}.destroy`, { resources: [], outputs: [] }),
    generateAsync: () =>
      recordedAsync(calls, `${descriptor.id}.generate`, [
        { owner: runtimeOwner, path: 'infra/compose.yaml', content: 'services: {}\n' },
      ]),
  };
}

function createService(descriptor: InfraAdapterDescriptor, calls: string[]): InfraServiceAdapter {
  const serviceOwner = descriptor.id === 'supabase' ? databaseOwner : vaultOwner;
  const dependencies = descriptor.id === 'supabase' ? [runtimeOwner] : [databaseOwner];
  return {
    descriptor: descriptor as InfraServiceAdapter['descriptor'],
    validateAsync: () => recordedAsync(calls, `${descriptor.id}.validate`, null),
    planAsync: () =>
      recordedAsync(calls, `${descriptor.id}.plan`, [action(serviceOwner, dependencies)]),
    desiredWorkloadsAsync: () =>
      recordedAsync(calls, `${descriptor.id}.workloads`, [workload(descriptor.id)]),
    reconcileAsync: () =>
      recordedAsync(calls, `${descriptor.id}.reconcile`, { resources: [], outputs: [] }),
    statusAsync: () =>
      recordedAsync(calls, `${descriptor.id}.status`, [status(serviceOwner, 'ready')]),
    suspendAsync: () =>
      recordedAsync(calls, `${descriptor.id}.suspend`, {
        resources: [resource(serviceOwner, true)],
        outputs: [],
      }),
    destroyAsync: () =>
      recordedAsync(calls, `${descriptor.id}.destroy`, {
        resources: [resource(serviceOwner, true)],
        outputs: [],
      }),
  };
}

function ledger() {
  return {
    schemaVersion: 1,
    projectId: 'sample',
    environment: 'local',
    targets: [{ id: 'local', kind: 'local-host', os: 'linux', architecture: 'amd64' }],
    resources: [
      resource(computeOwner),
      resource(runtimeOwner),
      resource(databaseOwner, true),
      resource(vaultOwner, true),
    ],
    outputs: [
      {
        owner: runtimeOwner,
        name: 'url',
        visibility: 'public',
        value: 'https://example.test',
        environmentVariable: 'EXAMPLE_URL',
      },
      {
        owner: vaultOwner,
        name: 'credential',
        visibility: 'secret',
        reference: {
          source: 'secret-store',
          projectId: 'sample',
          environment: 'local',
          ref: 'example',
          key: 'password',
        },
      },
    ],
    artifacts: [],
  } as const;
}

function owner(adapter: InfraAdapterDescriptor['id'], resourceId: string): InfraResourceIdentity {
  return { projectId: 'sample', environment: 'local', adapter, resourceId };
}

function resource(identity: InfraResourceIdentity, persistent = false): InfraOwnedResource {
  return {
    identity,
    persistent,
    retention: persistent ? 'retain' : 'delete-on-destroy',
    dependsOn: [],
  };
}

function action(
  actionOwner: InfraResourceIdentity,
  dependsOn: readonly InfraResourceIdentity[],
): InfraPlanAction {
  return {
    owner: actionOwner,
    operation: 'create',
    impact: 'none',
    detail: `Create ${actionOwner.resourceId}.`,
    dependsOn,
  };
}

function status(
  statusOwner: InfraResourceIdentity,
  state: InfraResourceStatus['state'],
): InfraResourceStatus {
  return { owner: statusOwner, state };
}

function workload(id: string): InfraWorkloadSpec {
  return { id, artifact: { kind: 'image', image: `example/${id}:1` } };
}

function descriptorForPackage(packageName: string): InfraAdapterDescriptor {
  const descriptor = Object.values(INFRA_ADAPTER_CATALOG).find(
    ({ package: candidate }) => candidate === packageName,
  );
  if (descriptor === undefined) throw new Error('Unexpected package.');
  return descriptor;
}

function recorded<T>(calls: string[], call: string, value: T): InfraResult<T> {
  calls.push(call);
  return success(value);
}

function recordedAsync<T>(calls: string[], call: string, value: T): Promise<InfraResult<T>> {
  return Promise.resolve(recorded(calls, call, value));
}

function success<T>(value: T): InfraResult<T> {
  return { ok: true, value, diagnostics: [] };
}
