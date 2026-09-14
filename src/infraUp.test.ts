import type {
  InfraAdapterDescriptor,
  InfraComputeAdapter,
  InfraDiagnostic,
  InfraEnvironmentSpec,
  InfraOutput,
  InfraResult,
  InfraRuntimeAdapter,
  InfraRuntimeDesiredState,
  InfraServiceAdapter,
  InfraWorkloadSpec,
} from '@ankhorage/contracts/infra';
import { INFRA_ADAPTER_CATALOG } from '@ankhorage/contracts/infra';
import { describe, expect, it } from 'bun:test';

import type { InfraAdapterPackageResolver } from './features/environment-lifecycle/application/ports/outbound/infraAdapterPackage';
import { upInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/upInfraEnvironmentAsync';
import type { InfraOrchestrationDependencies } from './types/infraOrchestration';

const environment = {
  deployment: { compute: { provider: 'local' }, runtime: { provider: 'docker-compose' } },
  database: { provider: 'supabase' },
  auth: { provider: 'supabase' },
  authz: { provider: 'cerbos', kind: 'ABAC' },
  workloads: [workload('app')],
} as const satisfies InfraEnvironmentSpec;
const manifest = { environments: { local: environment }, modules: [] } as const;

describe('environment up orchestration', () => {
  it('validates before mutation and reconciles compute, runtime and deduplicated services', async () => {
    const calls: string[] = [];
    const observedRuntimeDesired: InfraRuntimeDesiredState[] = [];
    const observedServiceOutputs: InfraOutput[][] = [];
    const dependencies = createDependencies(calls, observedRuntimeDesired, observedServiceOutputs);
    const result = await upInfraEnvironmentAsync({ projectId: 'sample', manifest }, dependencies);

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      'local.validate',
      'supabase.validate',
      'cerbos.validate',
      'supabase.workloads',
      'cerbos.workloads',
      'local.ensure',
      'docker-compose.validate',
      'docker-compose.ensure',
      'supabase.reconcile',
      'cerbos.reconcile',
    ]);
    expect(observedRuntimeDesired).toHaveLength(2);
    expect(observedRuntimeDesired[0]?.workloads.map(({ id }) => id)).toEqual([
      'app',
      'supabase',
      'cerbos',
    ]);
    expect(observedRuntimeDesired[0]?.targets).toEqual([
      { id: 'local', kind: 'local-host', os: 'linux', architecture: 'amd64' },
    ]);
    expect(observedServiceOutputs).toHaveLength(2);
    expect(observedServiceOutputs[0]?.map(({ name }) => name)).toEqual([
      'computeEndpoint',
      'runtimeEndpoint',
    ]);
    if (!result.ok) throw new Error('Expected successful up.');
    expect(result.value.environment).toBe('local');
    expect(result.value.outputs.map(({ name }) => name)).toEqual([
      'computeEndpoint',
      'runtimeEndpoint',
      'supabaseOutput',
      'cerbosOutput',
    ]);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(['compute-warning']);
  });

  it('stops before mutation when service validation fails', async () => {
    const calls: string[] = [];
    const dependencies = createDependencies(calls, [], [], 'supabase.validate');
    const result = await upInfraEnvironmentAsync({ projectId: 'sample', manifest }, dependencies);

    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'fixture-failure' }] });
    expect(calls).toEqual(['local.validate', 'supabase.validate']);
  });

  it('does not reconcile services after a runtime failure', async () => {
    const calls: string[] = [];
    const dependencies = createDependencies(calls, [], [], 'docker-compose.ensure');
    const result = await upInfraEnvironmentAsync({ projectId: 'sample', manifest }, dependencies);

    expect(result.ok).toBe(false);
    expect(calls.at(-1)).toBe('docker-compose.ensure');
    expect(calls).not.toContain('supabase.reconcile');
  });
});

function createDependencies(
  calls: string[],
  runtimeDesired: InfraRuntimeDesiredState[],
  serviceOutputs: InfraOutput[][],
  failure?: string,
): InfraOrchestrationDependencies {
  return {
    adapterResolver: createResolver(calls, runtimeDesired, serviceOutputs, failure),
    credentials: { resolveAsync: () => Promise.resolve(success({})) },
    secrets: { resolveAsync: () => Promise.resolve(success('secret')) },
  };
}

function createResolver(
  calls: string[],
  runtimeDesired: InfraRuntimeDesiredState[],
  serviceOutputs: InfraOutput[][],
  failure?: string,
): InfraAdapterPackageResolver {
  return {
    loadAsync(packageName) {
      const descriptor = descriptorForPackage(packageName);
      return Promise.resolve({
        infraAdapterDescriptor: descriptor,
        createInfraAdapter: () =>
          createAdapter(descriptor, calls, runtimeDesired, serviceOutputs, failure),
      });
    },
  };
}

function createAdapter(
  descriptor: InfraAdapterDescriptor,
  calls: string[],
  runtimeDesired: InfraRuntimeDesiredState[],
  serviceOutputs: InfraOutput[][],
  failure?: string,
): unknown {
  if (descriptor.kind === 'compute') return createCompute(descriptor, calls, failure);
  if (descriptor.kind === 'runtime')
    return createRuntime(descriptor, calls, runtimeDesired, failure);
  return createService(descriptor, calls, serviceOutputs, failure);
}

function createCompute(
  descriptor: InfraAdapterDescriptor,
  calls: string[],
  failure?: string,
): InfraComputeAdapter {
  return {
    descriptor: descriptor as InfraComputeAdapter['descriptor'],
    validateAsync: () => recordAsync(calls, `${descriptor.id}.validate`, failure, null),
    inspectAsync: () => Promise.resolve(success({ resources: [], outputs: [], targets: [] })),
    planAsync: () => Promise.resolve(success([])),
    ensureAsync: () => {
      const recorded = record(calls, `${descriptor.id}.ensure`, failure, {
        resources: [],
        outputs: [publicOutput('local', 'compute', 'computeEndpoint')],
        targets: [{ id: 'local', kind: 'local-host', os: 'linux', architecture: 'amd64' } as const],
      });
      return Promise.resolve(
        recorded.ok ? { ...recorded, diagnostics: [diagnostic('compute-warning')] } : recorded,
      );
    },
    statusAsync: () => Promise.resolve(success([])),
    destroyAsync: () => Promise.resolve(success({ resources: [], outputs: [] })),
  };
}

function createRuntime(
  descriptor: InfraAdapterDescriptor,
  calls: string[],
  observed: InfraRuntimeDesiredState[],
  failure?: string,
): InfraRuntimeAdapter {
  return {
    descriptor: descriptor as InfraRuntimeAdapter['descriptor'],
    validateAsync: (_context, desired) => {
      observed.push(desired);
      return Promise.resolve(record(calls, `${descriptor.id}.validate`, failure, null));
    },
    planAsync: () => Promise.resolve(success([])),
    ensureAsync: (_context, desired) => {
      observed.push(desired);
      return Promise.resolve(
        record(calls, `${descriptor.id}.ensure`, failure, {
          resources: [],
          outputs: [publicOutput('docker-compose', 'runtime', 'runtimeEndpoint')],
        }),
      );
    },
    statusAsync: () => Promise.resolve(success([])),
    suspendAsync: () => Promise.resolve(success({ resources: [], outputs: [] })),
    destroyAsync: () => Promise.resolve(success({ resources: [], outputs: [] })),
  };
}

function createService(
  descriptor: InfraAdapterDescriptor,
  calls: string[],
  observed: InfraOutput[][],
  failure?: string,
): InfraServiceAdapter {
  return {
    descriptor: descriptor as InfraServiceAdapter['descriptor'],
    validateAsync: () => recordAsync(calls, `${descriptor.id}.validate`, failure, null),
    planAsync: () => Promise.resolve(success([])),
    desiredWorkloadsAsync: () =>
      recordAsync(calls, `${descriptor.id}.workloads`, failure, [workload(descriptor.id)]),
    reconcileAsync: (_context, outputs) => {
      observed.push([...outputs]);
      return Promise.resolve(
        record(calls, `${descriptor.id}.reconcile`, failure, {
          resources: [],
          outputs: [publicOutput(descriptor.id, descriptor.id, `${descriptor.id}Output`)],
        }),
      );
    },
    statusAsync: () => Promise.resolve(success([])),
    destroyAsync: () => Promise.resolve(success({ resources: [], outputs: [] })),
  };
}

function record<T>(calls: string[], call: string, failure: string | undefined, value: T) {
  calls.push(call);
  return failure === call
    ? ({ ok: false, diagnostics: [diagnostic('fixture-failure')] } as const)
    : success(value);
}

function recordAsync<T>(calls: string[], call: string, failure: string | undefined, value: T) {
  return Promise.resolve(record(calls, call, failure, value));
}

function workload(id: string): InfraWorkloadSpec {
  return { id, artifact: { kind: 'image', image: `example/${id}:1` } };
}

function publicOutput(
  adapter: InfraAdapterDescriptor['id'],
  resourceId: string,
  name: string,
): InfraOutput {
  return {
    owner: { projectId: 'sample', environment: 'local', adapter, resourceId },
    name,
    visibility: 'public',
    value: `https://${resourceId}.example.test`,
  };
}

function descriptorForPackage(packageName: string): InfraAdapterDescriptor {
  const descriptor = Object.values(INFRA_ADAPTER_CATALOG).find(
    ({ package: candidate }) => candidate === packageName,
  );
  if (descriptor === undefined) throw new Error('Unexpected package.');
  return descriptor;
}

function diagnostic(code: string): InfraDiagnostic {
  return { severity: 'warning', code, message: code };
}

function success<T>(value: T): InfraResult<T> {
  return { ok: true, value, diagnostics: [] };
}
