import type {
  InfraAdapterDescriptor,
  InfraComputeAdapter,
  InfraEnvironmentSpec,
  InfraResult,
  InfraRuntimeAdapter,
  InfraServiceAdapter,
} from '@ankhorage/contracts/infra';
import { INFRA_ADAPTER_CATALOG } from '@ankhorage/contracts/infra';
import { describe, expect, it } from 'bun:test';

import type { InfraAdapterPackageResolver } from './features/environment-lifecycle/application/ports/outbound/infraAdapterPackage';
import { resolveInfraAdaptersAsync } from './features/environment-lifecycle/application/use-cases/resolveInfraAdaptersAsync';
import { resolveInfraEnvironment } from './features/environment-lifecycle/domain/resolveInfraEnvironment';

const local = {
  deployment: { compute: { provider: 'local' }, runtime: { provider: 'docker-compose' } },
  database: { provider: 'supabase' },
  auth: { provider: 'supabase' },
  authz: { provider: 'cerbos', kind: 'ABAC' },
} as const satisfies InfraEnvironmentSpec;
const manifest = { environments: { local, preview: local }, modules: [] } as const;

describe('environment safety', () => {
  it('defaults only to local and requires explicit destroy selection', () => {
    expect(resolveInfraEnvironment({ manifest, operation: 'up' })).toMatchObject({
      ok: true,
      value: { id: 'local' },
    });
    expect(resolveInfraEnvironment({ manifest, operation: 'destroy' })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'infra-environment-required' }],
    });
  });

  it('accepts configured explicit environments and rejects unknown or absent ones', () => {
    expect(
      resolveInfraEnvironment({ manifest, operation: 'up', environment: 'preview' }),
    ).toMatchObject({ ok: true, value: { id: 'preview' } });
    expect(
      resolveInfraEnvironment({ manifest, operation: 'status', environment: 'production' }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'infra-environment-unconfigured' }] });
    expect(
      resolveInfraEnvironment({ manifest, operation: 'status', environment: 'staging' }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'infra-environment-invalid' }] });
  });
});

describe('selected adapter resolution', () => {
  it('loads only selected packages and deduplicates the Supabase platform', async () => {
    const requested: string[] = [];
    const resolver = createResolver(requested);
    const result = await resolveInfraAdaptersAsync(local, resolver);

    expect(result.ok).toBe(true);
    expect(requested).toEqual([
      '@ankhorage/local',
      '@ankhorage/docker-compose',
      '@ankhorage/supabase',
      '@ankhorage/cerbos',
    ]);
    if (!result.ok) throw new Error('Expected adapters.');
    expect(result.value.services.map(({ descriptor }) => descriptor.id)).toEqual([
      'supabase',
      'cerbos',
    ]);
  });

  it('fails closed for unavailable and malformed selected packages', async () => {
    const missing = await resolveInfraAdaptersAsync(local, {
      loadAsync: () => Promise.reject(new Error('missing')),
    });
    expect(missing.ok).toBe(false);
    expect(
      missing.diagnostics.every(({ code }) => code === 'infra-adapter-package-unavailable'),
    ).toBe(true);

    const malformed = await resolveInfraAdaptersAsync(local, {
      loadAsync: () => Promise.resolve({ createInfraAdapter: () => ({}) }),
    });
    expect(malformed.ok).toBe(false);
    expect(malformed.diagnostics.every(({ code }) => code === 'infra-adapter-module-invalid')).toBe(
      true,
    );
  });

  it('rejects a factory that throws or returns another valid adapter identity', async () => {
    const throwing = await resolveInfraAdaptersAsync(local, {
      loadAsync(packageName) {
        const descriptor = descriptorForPackage(packageName);
        return Promise.resolve({
          infraAdapterDescriptor: descriptor,
          createInfraAdapter: () => {
            throw new Error('secret provider detail');
          },
        });
      },
    });
    expect(throwing.ok).toBe(false);
    expect(throwing.diagnostics[0]).toMatchObject({ code: 'infra-local-adapter-invalid' });
    expect(throwing.diagnostics[0]?.message).not.toContain('secret provider detail');

    const mismatched = await resolveInfraAdaptersAsync(local, {
      loadAsync(packageName) {
        const descriptor = descriptorForPackage(packageName);
        return Promise.resolve({
          infraAdapterDescriptor: descriptor,
          createInfraAdapter: () =>
            descriptor.id === 'local'
              ? createComputeAdapter(INFRA_ADAPTER_CATALOG.hetzner)
              : createAdapter(descriptor),
        });
      },
    });
    expect(mismatched.ok).toBe(false);
    expect(mismatched.diagnostics[0]).toMatchObject({ code: 'infra-local-adapter-invalid' });
  });
});

function createResolver(requested: string[]): InfraAdapterPackageResolver {
  return {
    loadAsync(packageName) {
      requested.push(packageName);
      const descriptor = descriptorForPackage(packageName);
      return Promise.resolve({
        infraAdapterDescriptor: descriptor,
        createInfraAdapter: () => createAdapter(descriptor),
      });
    },
  };
}

function descriptorForPackage(packageName: string): InfraAdapterDescriptor {
  const descriptor = Object.values(INFRA_ADAPTER_CATALOG).find(
    ({ package: candidate }) => candidate === packageName,
  );
  if (descriptor === undefined) throw new Error('Unexpected package.');
  return descriptor;
}

function createAdapter(descriptor: InfraAdapterDescriptor): unknown {
  if (descriptor.kind === 'compute') return createComputeAdapter(descriptor);
  if (descriptor.kind === 'runtime') return createRuntimeAdapter(descriptor);
  return createServiceAdapter(descriptor);
}

function createComputeAdapter(descriptor: InfraAdapterDescriptor): InfraComputeAdapter {
  return {
    descriptor: descriptor as InfraComputeAdapter['descriptor'],
    validateAsync: successNull,
    inspectAsync: () => Promise.resolve(success({ resources: [], outputs: [], targets: [] })),
    planAsync: successEmpty,
    ensureAsync: () => Promise.resolve(success({ resources: [], outputs: [], targets: [] })),
    statusAsync: successEmpty,
    destroyAsync: () => Promise.resolve(success({ resources: [], outputs: [] })),
  };
}

function createRuntimeAdapter(descriptor: InfraAdapterDescriptor): InfraRuntimeAdapter {
  return {
    descriptor: descriptor as InfraRuntimeAdapter['descriptor'],
    validateAsync: successNull,
    planAsync: successEmpty,
    ensureAsync: () => Promise.resolve(success({ resources: [], outputs: [] })),
    statusAsync: successEmpty,
    suspendAsync: () => Promise.resolve(success({ resources: [], outputs: [] })),
    destroyAsync: () => Promise.resolve(success({ resources: [], outputs: [] })),
  };
}

function createServiceAdapter(descriptor: InfraAdapterDescriptor): InfraServiceAdapter {
  return {
    descriptor: descriptor as InfraServiceAdapter['descriptor'],
    validateAsync: successNull,
    planAsync: successEmpty,
    desiredWorkloadsAsync: successEmpty,
    reconcileAsync: () => Promise.resolve(success({ resources: [], outputs: [] })),
    statusAsync: successEmpty,
    destroyAsync: () => Promise.resolve(success({ resources: [], outputs: [] })),
  };
}

function successNull(): Promise<InfraResult<null>> {
  return Promise.resolve(success(null));
}

function successEmpty<T>(): Promise<InfraResult<readonly T[]>> {
  return Promise.resolve(success([]));
}

function success<T>(value: T): InfraResult<T> {
  return { ok: true, value, diagnostics: [] };
}
