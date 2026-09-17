import { createHash } from 'node:crypto';

import type {
  InfraComputeTarget,
  InfraControlPlaneCredentialRef,
  InfraCredentialPort,
  InfraLedger,
  InfraManifest,
  InfraResourceIdentity,
  InfraResult,
} from '@ankhorage/contracts/infra';
import {
  createInfraAdapter as createK3sInfraAdapter,
  infraAdapterDescriptor as k3sInfraAdapterDescriptor,
  type K3sClusterObservation,
  type K3sClusterSpec,
  type K3sControlPlane,
  type K3sNodeAccess,
} from '@ankhorage/k3s';
import {
  createInfraAdapter as createLocalInfraAdapter,
  infraAdapterDescriptor as localInfraAdapterDescriptor,
  type LocalHostObservation,
  type LocalHostProbe,
} from '@ankhorage/local';
import {
  createInfraAdapter as createSupabaseInfraAdapter,
  infraAdapterDescriptor as supabaseInfraAdapterDescriptor,
  type SupabaseControlPlane,
  type SupabaseControlPlaneRequest,
} from '@ankhorage/supabase';
import { expect, test } from 'bun:test';

import { destroyInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/destroyInfraEnvironmentAsync.js';
import { downInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/downInfraEnvironmentAsync.js';
import { getInfraEnvironmentOutputs } from './features/environment-lifecycle/application/use-cases/getInfraEnvironmentOutputs.js';
import { planInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/planInfraEnvironmentAsync.js';
import { statusInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/statusInfraEnvironmentAsync.js';
import { upInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/upInfraEnvironmentAsync.js';
import type { InfraOrchestrationDependencies } from './types/infraOrchestration.js';

const projectId = 'infra164-local-k3s-supabase';
const publicBaseUrl = 'http://127.0.0.1:54321';
const bucket = 'infra164-bucket';
const bootstrapCredential = { source: 'control-plane', name: 'SUPABASE_BOOTSTRAP' } as const;
const target: Extract<InfraComputeTarget, { kind: 'local-host' }> = {
  id: 'local',
  kind: 'local-host',
  os: 'linux',
  architecture: 'amd64',
};
const manifest = {
  environments: {
    local: {
      deployment: {
        compute: { provider: 'local' },
        runtime: { provider: 'k3s', topology: { servers: 1, agents: 0 } },
      },
      database: { provider: 'supabase', tier: 'dev' },
      auth: { provider: 'supabase' },
      objectStorage: { provider: 'supabase', buckets: [bucket] },
      networking: { publicBaseUrl },
    },
  },
  modules: [],
} as const satisfies InfraManifest;

test('runs local k3s and Supabase through the portable compute lifecycle', async () => {
  const fixture = new LocalK3sFixture();
  const dependencies = createDependencies(fixture);

  const initialPlan = requireSuccess(
    await planInfraEnvironmentAsync({ projectId, manifest }, dependencies),
  );
  expect(initialPlan.actions.some(({ operation }) => operation === 'create')).toBe(true);

  const firstUp = requireSuccess(
    await upInfraEnvironmentAsync({ projectId, manifest }, dependencies),
  );
  const firstLedger: InfraLedger = firstUp.ledger;
  expect(fixture.credentials.persistCount).toBe(1);
  const firstCredentials = fixture.credentials.readRequired();
  const firstCredentialFingerprint = credentialFingerprint(firstCredentials);
  assertPrivilegedValuesAbsent(firstUp, firstCredentials);
  expect(firstUp.targets).toEqual([target]);
  expect([...new Set(fixture.loadedPackages)].sort()).toEqual(
    [
      localInfraAdapterDescriptor.package,
      k3sInfraAdapterDescriptor.package,
      supabaseInfraAdapterDescriptor.package,
    ].sort(),
  );
  expect(fixture.k3s.lastAccess).toHaveLength(1);
  expect(fixture.k3s.lastAccess[0]?.transport).toEqual({ kind: 'local' });
  expect(fixture.k3s.lastSpec?.nodes[0]?.target).toEqual(target);
  expect(fixture.kubernetes.serializedResources()).toContain('PersistentVolumeClaim');
  expect(fixture.kubernetes.serializedResources()).toContain('/etc/postgresql-custom');
  expect(fixture.kubernetes.serializedResources()).toContain('.ankhorage-image-seeded');
  expect(fixture.supabase.buckets.has(bucket)).toBe(true);

  const outputs = requireSuccess(
    getInfraEnvironmentOutputs({
      projectId,
      manifest,
      environment: 'local',
      previous: firstLedger,
    }),
  );
  expect(outputs.outputs).toEqual(firstUp.outputs);
  expect(
    outputs.outputs.some(
      ({ environmentVariable, value }) =>
        environmentVariable === 'EXPO_PUBLIC_SUPABASE_URL' && value === publicBaseUrl,
    ),
  ).toBe(true);
  expect(outputs.outputs.some(({ name, value }) => name === 'bucket' && value === bucket)).toBe(
    true,
  );

  const status = requireSuccess(
    await statusInfraEnvironmentAsync(
      { projectId, manifest, environment: 'local', previous: firstLedger },
      dependencies,
    ),
  );
  expect(status.state).toBe('ready');

  const converged = requireSuccess(
    await planInfraEnvironmentAsync(
      { projectId, manifest, environment: 'local', previous: firstLedger },
      dependencies,
    ),
  );
  expect(converged.actions.every(({ operation }) => operation === 'noop')).toBe(true);

  const identitiesBeforeRestart = resourceIdentities(firstUp.resources);
  const down = requireSuccess(
    await downInfraEnvironmentAsync(
      { projectId, manifest, environment: 'local', previous: firstLedger },
      dependencies,
    ),
  );
  expect(fixture.k3s.state).toBe('stopped');

  const resumed = requireSuccess(
    await upInfraEnvironmentAsync(
      { projectId, manifest, environment: 'local', previous: down.ledger },
      dependencies,
    ),
  );
  expect(fixture.k3s.state).toBe('ready');
  expect(resumed.targets).toEqual([target]);
  expect(resourceIdentities(resumed.resources)).toEqual(identitiesBeforeRestart);
  expect(fixture.credentials.persistCount).toBe(1);
  expect(credentialFingerprint(fixture.credentials.readRequired())).toBe(
    firstCredentialFingerprint,
  );
  assertPrivilegedValuesAbsent(resumed, firstCredentials);

  const destroyed = requireSuccess(
    await destroyInfraEnvironmentAsync(
      {
        projectId,
        manifest,
        environment: 'local',
        previous: resumed.ledger,
        confirmation: { projectId, environment: 'local' },
        persistence: {
          policy: 'delete',
          confirmedResources: persistentIdentities(resumed.ledger),
        },
      },
      dependencies,
    ),
  );
  expect(destroyed.ledger).toBeNull();
  expect(fixture.k3s.state).toBe('absent');
  expect(fixture.k3s.calls).toContain('destroy');
});

class LocalK3sFixture {
  readonly local = new FakeLocalHostProbe();
  readonly k3s = new FakeK3sControlPlane();
  readonly kubernetes = this.k3s.api;
  readonly supabase = new FakeSupabaseControlPlane();
  readonly credentials = new MemoryCredentialPort();
  readonly loadedPackages: string[] = [];
}

function createDependencies(fixture: LocalK3sFixture): InfraOrchestrationDependencies {
  return {
    adapterResolver: {
      loadAsync: (packageName) => {
        fixture.loadedPackages.push(packageName);
        switch (packageName) {
          case localInfraAdapterDescriptor.package:
            return Promise.resolve({
              infraAdapterDescriptor: localInfraAdapterDescriptor,
              createInfraAdapter: () => createLocalInfraAdapter({ probe: fixture.local }),
            });
          case k3sInfraAdapterDescriptor.package:
            return Promise.resolve({
              infraAdapterDescriptor: k3sInfraAdapterDescriptor,
              createInfraAdapter: () => createK3sInfraAdapter({ controlPlane: fixture.k3s }),
            });
          case supabaseInfraAdapterDescriptor.package:
            return Promise.resolve({
              infraAdapterDescriptor: supabaseInfraAdapterDescriptor,
              createInfraAdapter: () =>
                createSupabaseInfraAdapter({ controlPlane: fixture.supabase }),
            });
          default:
            return Promise.reject(new Error(`Unexpected adapter package: ${packageName}`));
        }
      },
    },
    credentials: fixture.credentials,
    secrets: {
      resolveAsync: () =>
        Promise.resolve({
          ok: false,
          diagnostics: [
            { severity: 'error', code: 'unexpected-secret', message: 'No secret is expected.' },
          ],
        }),
    },
  };
}

class MemoryCredentialPort implements InfraCredentialPort {
  private values: Readonly<Record<string, string>> | null = null;
  persistCount = 0;

  findAsync(
    reference: InfraControlPlaneCredentialRef,
  ): Promise<InfraResult<Readonly<Record<string, string>> | null>> {
    if (reference.name !== bootstrapCredential.name) return Promise.resolve(success(null));
    return Promise.resolve(success(this.values === null ? null : { ...this.values }));
  }

  resolveAsync(
    reference: InfraControlPlaneCredentialRef,
  ): Promise<InfraResult<Readonly<Record<string, string>>>> {
    if (reference.name === bootstrapCredential.name && this.values !== null) {
      return Promise.resolve(success({ ...this.values }));
    }
    return Promise.resolve(
      failure(
        'unexpected-credential',
        `Unexpected or missing credential reference: ${reference.name}`,
      ),
    );
  }

  persistAsync(
    reference: InfraControlPlaneCredentialRef,
    values: Readonly<Record<string, string>>,
  ): Promise<InfraResult<null>> {
    if (reference.name !== bootstrapCredential.name) {
      return Promise.resolve(
        failure('unexpected-credential', `Unexpected credential reference: ${reference.name}`),
      );
    }
    this.values = { ...values };
    this.persistCount += 1;
    return Promise.resolve(success(null));
  }

  readRequired(): Readonly<Record<string, string>> {
    if (this.values === null) throw new Error('Expected generated Supabase bootstrap credentials.');
    return { ...this.values };
  }
}

function credentialFingerprint(values: Readonly<Record<string, string>>): string {
  const canonical = Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}\u0000${value}`)
    .join('\u0001');
  return createHash('sha256').update(canonical).digest('hex');
}

function privilegedCredentialValues(values: Readonly<Record<string, string>>): readonly string[] {
  const { anonKey: _anonKey, ...privileged } = values;
  return Object.values(privileged);
}

function assertPrivilegedValuesAbsent(
  value: unknown,
  credentials: Readonly<Record<string, string>>,
): void {
  const serialized = JSON.stringify(value);
  for (const secret of privilegedCredentialValues(credentials)) {
    expect(serialized).not.toContain(secret);
  }
}

class FakeLocalHostProbe implements LocalHostProbe {
  inspectAsync(workingDirectory: string): Promise<InfraResult<LocalHostObservation>> {
    return Promise.resolve(
      success({
        target,
        workingDirectory,
        exists: true,
        readable: true,
        writable: true,
      }),
    );
  }
}

type KubernetesApi = NonNullable<K3sClusterObservation['api']>;
type KubernetesOwnershipQuery = Parameters<KubernetesApi['listOwnedAsync']>[0];
type KubernetesResource = Awaited<ReturnType<KubernetesApi['listOwnedAsync']>>[number];
type KubernetesResourceReference = Parameters<KubernetesApi['deleteAsync']>[0];
type KubernetesResourceObservation = Awaited<ReturnType<KubernetesApi['observeAsync']>>;

class FakeK3sControlPlane implements K3sControlPlane {
  readonly api = new FakeKubernetesApi();
  readonly calls: string[] = [];
  lastAccess: readonly K3sNodeAccess[] = [];
  lastSpec?: K3sClusterSpec;
  state: K3sClusterObservation['state'] = 'absent';
  nodes: K3sClusterObservation['nodes'] = [];

  validateAsync(
    _spec: K3sClusterSpec,
    access: readonly K3sNodeAccess[],
  ): Promise<InfraResult<null>> {
    this.calls.push('validate');
    this.lastAccess = access;
    return Promise.resolve(success(null));
  }

  inspectAsync(): Promise<InfraResult<K3sClusterObservation>> {
    this.calls.push('inspect');
    return Promise.resolve(success(this.observation()));
  }

  ensureAsync(
    spec: K3sClusterSpec,
    access: readonly K3sNodeAccess[],
  ): Promise<InfraResult<K3sClusterObservation>> {
    this.calls.push('ensure');
    this.lastAccess = access;
    this.lastSpec = spec;
    this.state = 'ready';
    this.nodes = spec.nodes.map(({ id }) => ({
      id,
      state: 'ready',
      configurationMatches: true,
    }));
    return Promise.resolve(success(this.observation()));
  }

  waitUntilReadyAsync(): Promise<InfraResult<K3sClusterObservation>> {
    this.calls.push('wait');
    return Promise.resolve(success(this.observation()));
  }

  loadImagesAsync(
    _spec: K3sClusterSpec,
    _access: readonly K3sNodeAccess[],
    images: readonly string[],
  ): Promise<InfraResult<null>> {
    this.calls.push(`images:${images.join(',')}`);
    return Promise.resolve(success(null));
  }

  suspendAsync(): Promise<InfraResult<null>> {
    this.calls.push('suspend');
    this.state = 'stopped';
    this.nodes = this.nodes.map((node) => ({ ...node, state: 'stopped' }));
    return Promise.resolve(success(null));
  }

  destroyAsync(): Promise<InfraResult<null>> {
    this.calls.push('destroy');
    this.state = 'absent';
    this.nodes = [];
    return Promise.resolve(success(null));
  }

  private observation(): K3sClusterObservation {
    return {
      state: this.state,
      configurationMatches: true,
      nodes: this.nodes,
      ...(this.state === 'ready' ? { api: this.api } : {}),
    };
  }
}

class FakeKubernetesApi implements KubernetesApi {
  readonly resources: KubernetesResource[] = [];

  listOwnedAsync(query: KubernetesOwnershipQuery): Promise<readonly KubernetesResource[]> {
    return Promise.resolve(
      this.resources.filter(({ metadata }) => includesLabels(metadata.labels, query.labels)),
    );
  }

  applyAsync(resource: KubernetesResource): Promise<void> {
    const index = this.resources.findIndex((candidate) => sameResource(candidate, resource));
    if (index === -1) this.resources.push(resource);
    else this.resources.splice(index, 1, resource);
    return Promise.resolve();
  }

  deleteAsync(reference: KubernetesResourceReference): Promise<void> {
    const index = this.resources.findIndex((resource) => sameResource(resource, reference));
    if (index >= 0) this.resources.splice(index, 1);
    return Promise.resolve();
  }

  observeAsync(reference: KubernetesResourceReference): Promise<KubernetesResourceObservation> {
    return Promise.resolve({
      state: 'ready',
      ...(reference.kind === 'Service' ? { publicOutputs: { endpoint: publicBaseUrl } } : {}),
    });
  }

  waitUntilReadyAsync(): Promise<KubernetesResourceObservation> {
    return Promise.resolve({ state: 'ready' });
  }

  serializedResources(): string {
    return JSON.stringify(this.resources);
  }
}

class FakeSupabaseControlPlane implements SupabaseControlPlane {
  readonly buckets = new Set<string>();

  healthAsync(_request: SupabaseControlPlaneRequest): Promise<InfraResult<null>> {
    return Promise.resolve(success(null));
  }

  listBucketsAsync(_request: SupabaseControlPlaneRequest): Promise<InfraResult<readonly string[]>> {
    return Promise.resolve(success([...this.buckets]));
  }

  createBucketAsync(
    request: SupabaseControlPlaneRequest & { readonly bucket: string },
  ): Promise<InfraResult<null>> {
    this.buckets.add(request.bucket);
    return Promise.resolve(success(null));
  }

  deleteBucketAsync(
    request: SupabaseControlPlaneRequest & { readonly bucket: string },
  ): Promise<InfraResult<null>> {
    this.buckets.delete(request.bucket);
    return Promise.resolve(success(null));
  }
}

function persistentIdentities(ledger: InfraLedger): readonly InfraResourceIdentity[] {
  return ledger.resources.filter(({ persistent }) => persistent).map(({ identity }) => identity);
}

function resourceIdentities(
  resources: readonly { readonly identity: InfraResourceIdentity }[],
): readonly string[] {
  return resources
    .map(({ identity }) =>
      [identity.projectId, identity.environment, identity.adapter, identity.resourceId].join(':'),
    )
    .sort();
}

function includesLabels(
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(expected).every(([expectedKey, expectedValue]) =>
    Object.entries(actual).some(
      ([actualKey, actualValue]) => actualKey === expectedKey && actualValue === expectedValue,
    ),
  );
}

function sameResource(
  left: KubernetesResource,
  right: KubernetesResource | KubernetesResourceReference,
): boolean {
  return (
    left.apiVersion === right.apiVersion &&
    left.kind === right.kind &&
    left.metadata.name === ('metadata' in right ? right.metadata.name : right.name) &&
    left.metadata.namespace === ('metadata' in right ? right.metadata.namespace : right.namespace)
  );
}

function requireSuccess<T>(result: InfraResult<T>): T {
  if (!result.ok) throw new Error(result.diagnostics.map(({ message }) => message).join(' '));
  return result.value;
}

function success<T>(value: T): InfraResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure(code: string, message: string): InfraResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, message }] };
}
