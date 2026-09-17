import type {
  InfraControlPlaneCredentialRef,
  InfraCredentialPort,
  InfraManifest,
  InfraResult,
} from '@ankhorage/contracts/infra';
import {
  createInfraAdapter as createHetznerInfraAdapter,
  type HetznerCloudApi,
  type HetznerCloudObservation,
  type HetznerDesiredCompute,
  type HetznerHostKeyProbe,
  type HetznerProjectIdentity,
  type HetznerResourceId,
  infraAdapterDescriptor as hetznerInfraAdapterDescriptor,
} from '@ankhorage/hetzner';
import {
  createInfraAdapter as createK3sInfraAdapter,
  infraAdapterDescriptor as k3sInfraAdapterDescriptor,
  type K3sClusterObservation,
  type K3sClusterSpec,
  type K3sControlPlane,
  type K3sNodeAccess,
} from '@ankhorage/k3s';
import {
  createInfraAdapter as createR2InfraAdapter,
  infraAdapterDescriptor as r2InfraAdapterDescriptor,
  type R2BucketControlPlane,
  type R2BucketObservation,
  type R2CloudRequest,
} from '@ankhorage/r2';
import {
  createInfraAdapter as createSupabaseInfraAdapter,
  infraAdapterDescriptor as supabaseInfraAdapterDescriptor,
  type SupabaseControlPlane,
  type SupabaseControlPlaneRequest,
} from '@ankhorage/supabase';
import { expect, test } from 'bun:test';

import { planInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/planInfraEnvironmentAsync.js';
import { statusInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/statusInfraEnvironmentAsync.js';
import { upInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/upInfraEnvironmentAsync.js';
import type { InfraOrchestrationDependencies } from './types/infraOrchestration.js';

const projectId = 'infra163-production-r2';
const publicBaseUrl = 'https://api.r2-production.example.test';
const domain = 'api.r2-production.example.test';
const r2AccountId = 'phase10-r2-account';
const r2Bucket = 'media';

const manifest = {
  environments: {
    production: {
      deployment: {
        compute: { provider: 'hetzner', location: 'fsn1', serverType: 'cx23' },
        runtime: { provider: 'k3s', topology: { servers: 1, agents: 0 } },
      },
      database: { provider: 'supabase', tier: 'prod' },
      auth: { provider: 'supabase' },
      objectStorage: { provider: 'r2', accountId: r2AccountId, buckets: [r2Bucket] },
      networking: {
        domain,
        publicBaseUrl,
        tls: { mode: 'acme-http-01', contactEmail: 'infra@example.test' },
      },
    },
  },
  modules: [],
} as const satisfies InfraManifest;

test('composes Hetzner, k3s, Supabase database/auth and independent R2 object storage', async () => {
  const fixture = new ProductionR2Fixture();
  const dependencies = createDependencies(fixture);

  const initialPlan = requireSuccess(
    await planInfraEnvironmentAsync(
      { projectId, manifest, environment: 'production' },
      dependencies,
    ),
  );
  const initialOwners = new Set(initialPlan.actions.map(({ owner }) => owner.adapter));
  expect(initialOwners.has('supabase')).toBe(true);
  expect(initialOwners.has('r2')).toBe(true);
  expect(initialPlan.actions.some(({ operation }) => operation === 'create')).toBe(true);

  const firstUp = requireSuccess(
    await upInfraEnvironmentAsync({ projectId, manifest, environment: 'production' }, dependencies),
  );
  const serializedWorkloads = fixture.kubernetes.serializedResources();
  expect(serializedWorkloads).toContain('supabase-db');
  expect(serializedWorkloads).toContain('supabase-auth');
  expect(serializedWorkloads).toContain('supabase-gateway');
  expect(serializedWorkloads).not.toContain('supabase-storage');
  expect(serializedWorkloads).not.toContain('supabase-imgproxy');
  expect(serializedWorkloads).not.toContain('/storage/v1/');
  expect(fixture.supabase.created).toEqual([]);
  expect(fixture.r2.created).toEqual([r2Bucket]);

  expect(
    firstUp.resources.some(
      ({ identity }) => identity.adapter === 'r2' && identity.resourceId === `bucket/${r2Bucket}`,
    ),
  ).toBe(true);
  expect(
    firstUp.resources.some(
      ({ identity }) =>
        identity.adapter === 'supabase' && identity.resourceId.startsWith('bucket/'),
    ),
  ).toBe(false);

  const r2Outputs = firstUp.outputs.filter(({ owner }) => owner.adapter === 'r2');
  expect(r2Outputs.map(({ name }) => name)).toEqual(['bucket', 'accountId', 's3Endpoint']);
  expect(r2Outputs.every(({ visibility }) => visibility === 'public')).toBe(true);
  expect(r2Outputs.map(({ value }) => value)).toEqual([
    r2Bucket,
    r2AccountId,
    `https://${r2AccountId}.r2.cloudflarestorage.com`,
  ]);

  const serializedOutputs = JSON.stringify(firstUp.outputs);
  expect(serializedOutputs).not.toContain('phase10-r2-api-token');
  expect(serializedOutputs).not.toContain('phase10-private-key');
  expect(serializedOutputs).not.toContain('phase10-postgres-password');
  expect(serializedOutputs).not.toContain('phase10-jwt-secret');
  expect(serializedOutputs).not.toContain('phase10-service-role-key');

  const status = requireSuccess(
    await statusInfraEnvironmentAsync(
      { projectId, manifest, environment: 'production', previous: firstUp.ledger },
      dependencies,
    ),
  );
  expect(status.state).toBe('ready');

  const converged = requireSuccess(
    await planInfraEnvironmentAsync(
      { projectId, manifest, environment: 'production', previous: firstUp.ledger },
      dependencies,
    ),
  );
  expect(converged.actions.every(({ operation }) => operation === 'noop')).toBe(true);

  const secondUp = requireSuccess(
    await upInfraEnvironmentAsync(
      { projectId, manifest, environment: 'production', previous: firstUp.ledger },
      dependencies,
    ),
  );
  expect(fixture.r2.created).toEqual([r2Bucket]);
  expect(secondUp.outputs.filter(({ owner }) => owner.adapter === 'r2')).toEqual(r2Outputs);
});

class ProductionR2Fixture {
  readonly hetzner = new FakeHetznerCloudApi();
  readonly hostKeyProbe = new FakeHostKeyProbe();
  readonly k3s = new FakeK3sControlPlane();
  readonly kubernetes = this.k3s.api;
  readonly supabase = new FakeSupabaseControlPlane();
  readonly r2 = new FakeR2ControlPlane();
}

function createDependencies(fixture: ProductionR2Fixture): InfraOrchestrationDependencies {
  return {
    adapterResolver: {
      loadAsync: (packageName) => {
        switch (packageName) {
          case hetznerInfraAdapterDescriptor.package:
            return Promise.resolve({
              infraAdapterDescriptor: hetznerInfraAdapterDescriptor,
              createInfraAdapter: () =>
                createHetznerInfraAdapter({
                  api: fixture.hetzner,
                  hostKeyProbe: fixture.hostKeyProbe,
                }),
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
          case r2InfraAdapterDescriptor.package:
            return Promise.resolve({
              infraAdapterDescriptor: r2InfraAdapterDescriptor,
              createInfraAdapter: () => createR2InfraAdapter({ cloud: fixture.r2 }),
            });
          default:
            return Promise.reject(new Error(`Unexpected adapter package: ${packageName}`));
        }
      },
    },
    credentials: createCredentialPort(),
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

function createCredentialPort(): InfraCredentialPort {
  return {
    findAsync: (reference) => Promise.resolve(findCredential(reference)),
    resolveAsync: ({ name }) => Promise.resolve(resolveCredential(name)),
    persistAsync: (reference) =>
      Promise.resolve({
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'unexpected-credential-persist',
            message: `Production fixture must not persist credential ${reference.name}.`,
          },
        ],
      }),
  };
}

function findCredential(
  reference: InfraControlPlaneCredentialRef,
): InfraResult<Readonly<Record<string, string>> | null> {
  return reference.name === 'SUPABASE_BOOTSTRAP'
    ? resolveCredential(reference.name)
    : success(null);
}

function resolveCredential(name: string): InfraResult<Readonly<Record<string, string>>> {
  if (name === 'HCLOUD_TOKEN') return success({ token: 'phase10-hcloud-token' });
  if (name === 'HETZNER_SSH') {
    return success({
      publicKey: 'ssh-ed25519 AAAA phase10',
      privateKey: 'phase10-private-key',
    });
  }
  if (name === 'SUPABASE_BOOTSTRAP') {
    return success({
      postgresPassword: 'phase10-postgres-password',
      jwtSecret: 'phase10-jwt-secret-0123456789abcdef',
      anonKey: 'phase10-anon-key',
      serviceRoleKey: 'phase10-service-role-key',
      realtimeSecretKeyBase:
        'phase10-realtime-secret-key-base-0123456789abcdefghijklmnopqrstuvwxyz',
      realtimeDatabaseEncryptionKey: '1234567890abcdef',
      pgMetaCryptoKey: 'phase10-pg-meta-crypto-key-0123456789abcdef',
    });
  }
  if (name === 'CLOUDFLARE_R2') return success({ apiToken: 'phase10-r2-api-token' });
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'unexpected-credential',
        message: `Unexpected credential reference: ${name}`,
      },
    ],
  };
}

class FakeHetznerCloudApi implements HetznerCloudApi {
  observation: HetznerCloudObservation = { resources: [] };

  validateAsync(): Promise<InfraResult<null>> {
    return Promise.resolve(success(null));
  }

  inspectAsync(): Promise<InfraResult<HetznerCloudObservation>> {
    return Promise.resolve(success(this.observation));
  }

  reconcileAsync(
    _token: string,
    desired: HetznerDesiredCompute,
  ): Promise<InfraResult<HetznerCloudObservation>> {
    this.observation = {
      resources: [desired.network, desired.firewall, desired.sshKey, desired.server].map(
        (resource, index) => ({
          resourceId: resource.owner.identity.resourceId as HetznerResourceId,
          externalId: String(index + 1),
          configurationHash: resource.configurationHash,
          state: 'ready' as const,
          ...(resource.owner.identity.resourceId === 'server'
            ? { publicIpv4: '203.0.113.10', architecture: 'amd64' as const }
            : {}),
        }),
      ),
    };
    return Promise.resolve(success(this.observation));
  }

  destroyAsync(
    _token: string,
    _identity: HetznerProjectIdentity,
    resourceIds: readonly HetznerResourceId[],
  ): Promise<InfraResult<HetznerCloudObservation>> {
    this.observation = {
      resources: this.observation.resources.filter(
        ({ resourceId }) => !resourceIds.includes(resourceId),
      ),
    };
    return Promise.resolve(success(this.observation));
  }
}

class FakeHostKeyProbe implements HetznerHostKeyProbe {
  fingerprintAsync(): Promise<InfraResult<string>> {
    return Promise.resolve(success('SHA256:phase10-host'));
  }
}

type KubernetesApi = NonNullable<K3sClusterObservation['api']>;
type KubernetesOwnershipQuery = Parameters<KubernetesApi['listOwnedAsync']>[0];
type KubernetesResource = Awaited<ReturnType<KubernetesApi['listOwnedAsync']>>[number];
type KubernetesResourceReference = Parameters<KubernetesApi['deleteAsync']>[0];
type KubernetesResourceObservation = Awaited<ReturnType<KubernetesApi['observeAsync']>>;

class FakeK3sControlPlane implements K3sControlPlane {
  readonly api = new FakeKubernetesApi();
  lastAccess: readonly K3sNodeAccess[] = [];
  lastSpec?: K3sClusterSpec;
  state: K3sClusterObservation['state'] = 'absent';
  nodes: K3sClusterObservation['nodes'] = [];

  validateAsync(
    _spec: K3sClusterSpec,
    access: readonly K3sNodeAccess[],
  ): Promise<InfraResult<null>> {
    this.lastAccess = access;
    return Promise.resolve(success(null));
  }

  inspectAsync(): Promise<InfraResult<K3sClusterObservation>> {
    return Promise.resolve(success(this.observation()));
  }

  ensureAsync(
    spec: K3sClusterSpec,
    access: readonly K3sNodeAccess[],
  ): Promise<InfraResult<K3sClusterObservation>> {
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
    return Promise.resolve(success(this.observation()));
  }

  loadImagesAsync(
    _spec: K3sClusterSpec,
    _access: readonly K3sNodeAccess[],
    _images: readonly string[],
  ): Promise<InfraResult<null>> {
    return Promise.resolve(success(null));
  }

  suspendAsync(): Promise<InfraResult<null>> {
    this.state = 'stopped';
    this.nodes = this.nodes.map((node) => ({ ...node, state: 'stopped' }));
    return Promise.resolve(success(null));
  }

  destroyAsync(): Promise<InfraResult<null>> {
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
  readonly created: string[] = [];

  healthAsync(_request: SupabaseControlPlaneRequest): Promise<InfraResult<null>> {
    return Promise.resolve(success(null));
  }

  listBucketsAsync(_request: SupabaseControlPlaneRequest): Promise<InfraResult<readonly string[]>> {
    return Promise.resolve(success([]));
  }

  createBucketAsync(
    request: SupabaseControlPlaneRequest & { readonly bucket: string },
  ): Promise<InfraResult<null>> {
    this.created.push(request.bucket);
    return Promise.resolve(success(null));
  }

  deleteBucketAsync(
    _request: SupabaseControlPlaneRequest & { readonly bucket: string },
  ): Promise<InfraResult<null>> {
    return Promise.resolve(success(null));
  }
}

class FakeR2ControlPlane implements R2BucketControlPlane {
  readonly created: string[] = [];
  private readonly buckets = new Set<string>();

  listBucketsAsync(): Promise<InfraResult<readonly R2BucketObservation[]>> {
    return Promise.resolve(success([...this.buckets].map((name) => ({ name }))));
  }

  createBucketAsync(
    request: R2CloudRequest & { readonly bucket: string },
  ): Promise<InfraResult<R2BucketObservation>> {
    this.created.push(request.bucket);
    this.buckets.add(request.bucket);
    return Promise.resolve(success({ name: request.bucket }));
  }

  deleteBucketAsync(
    request: R2CloudRequest & { readonly bucket: string },
  ): Promise<InfraResult<null>> {
    this.buckets.delete(request.bucket);
    return Promise.resolve(success(null));
  }
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
