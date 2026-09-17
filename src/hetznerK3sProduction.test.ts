import type {
  InfraControlPlaneCredentialRef,
  InfraCredentialPort,
  InfraLedger,
  InfraManifest,
  InfraResourceIdentity,
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
  createInfraAdapter as createSupabaseInfraAdapter,
  infraAdapterDescriptor as supabaseInfraAdapterDescriptor,
  type SupabaseControlPlane,
  type SupabaseControlPlaneRequest,
} from '@ankhorage/supabase';
import { expect, test } from 'bun:test';

import { destroyInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/destroyInfraEnvironmentAsync.js';
import { downInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/downInfraEnvironmentAsync.js';
import { planInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/planInfraEnvironmentAsync.js';
import { statusInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/statusInfraEnvironmentAsync.js';
import { upInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/upInfraEnvironmentAsync.js';
import type { InfraOrchestrationDependencies } from './types/infraOrchestration.js';

const projectId = 'infra145-production';
const publicBaseUrl = 'https://api.production.example.test';
const domain = 'api.production.example.test';
const persistenceTarget = {
  endpoint: 'https://s3.production.example.test',
  region: 'eu-central-1',
  bucket: 'infra145-database-backups',
  credentials: { source: 'control-plane', name: 'S3_PERSISTENCE' },
  forcePathStyle: true,
} as const;

const manifest = {
  environments: {
    local: {
      deployment: {
        compute: { provider: 'local' },
        runtime: { provider: 'docker-compose' },
      },
    },
    production: {
      deployment: {
        compute: { provider: 'hetzner', location: 'fsn1', serverType: 'cx23' },
        runtime: { provider: 'k3s', topology: { servers: 1, agents: 0 } },
      },
      database: {
        provider: 'supabase',
        tier: 'prod',
        backup: { mode: 'scheduled', target: persistenceTarget, intervalHours: 24 },
      },
      auth: { provider: 'supabase' },
      objectStorage: {
        provider: 'supabase',
        buckets: ['media'],
        backend: { ...persistenceTarget, bucket: 'infra145-storage' },
      },
      networking: {
        domain,
        publicBaseUrl,
        tls: { mode: 'acme-http-01', contactEmail: 'infra@example.test' },
      },
    },
  },
  modules: [],
} as const satisfies InfraManifest;

test('composes Hetzner, k3s, Kubernetes and Supabase while retaining compute for production data', async () => {
  const fixture = new ProductionFixture();
  const dependencies = createDependencies(fixture);

  const initialPlan = requireSuccess(
    await planInfraEnvironmentAsync(
      { projectId, manifest, environment: 'production' },
      dependencies,
    ),
  );
  expect(initialPlan.actions.some(({ operation }) => operation === 'create')).toBe(true);

  const firstUp = requireSuccess(
    await upInfraEnvironmentAsync({ projectId, manifest, environment: 'production' }, dependencies),
  );
  const firstLedger: InfraLedger = firstUp.ledger;
  expect(firstUp.targets).toEqual([
    {
      id: 'server',
      kind: 'ssh-host',
      os: 'linux',
      architecture: 'amd64',
      host: '203.0.113.10',
      port: 22,
      user: 'root',
      credential: { source: 'control-plane', name: 'HETZNER_SSH' },
      hostKeyFingerprint: 'SHA256:phase10-host',
    },
  ]);
  expect(fixture.k3s.lastAccess).toHaveLength(1);
  expect(fixture.k3s.lastSpec?.networking).toEqual({
    domain,
    publicBaseUrl,
    tls: { mode: 'acme-http-01', contactEmail: 'infra@example.test' },
  });
  const [access] = fixture.k3s.lastAccess;
  expect(access?.transport.kind).toBe('ssh');
  expect(access?.transport.kind === 'ssh' && access.transport.host).toBe('203.0.113.10');
  expect(JSON.stringify(firstUp)).not.toContain('phase10-private-key');
  expect(JSON.stringify(firstUp)).not.toContain('phase10-service-role-key');
  expect(JSON.stringify(firstUp)).not.toContain('phase10-s3-secret-key');
  expect(fixture.kubernetes.serializedResources()).toContain(`"host":"${domain}"`);
  expect(fixture.kubernetes.serializedResources()).toContain('PersistentVolumeClaim');
  expect(fixture.kubernetes.serializedResources()).toContain('/etc/postgresql-custom');
  expect(fixture.kubernetes.serializedResources()).toContain('.ankhorage-image-seeded');
  expect(fixture.kubernetes.serializedResources()).toContain('supabase-db-backup');
  expect(
    fixture.kubernetes.resources.filter(({ kind }) => kind === 'PersistentVolumeClaim'),
  ).toHaveLength(2);
  expect(firstUp.resources.some(({ persistent }) => persistent)).toBe(true);
  const urlOutput = firstUp.outputs.find(({ name }) => name === 'url');
  expect(urlOutput?.value).toBe(publicBaseUrl);
  expect(urlOutput?.visibility).toBe('public');

  const status = requireSuccess(
    await statusInfraEnvironmentAsync(
      { projectId, manifest, environment: 'production', previous: firstLedger },
      dependencies,
    ),
  );
  expect(status.state).toBe('ready');

  const converged = requireSuccess(
    await planInfraEnvironmentAsync(
      { projectId, manifest, environment: 'production', previous: firstLedger },
      dependencies,
    ),
  );
  expect(converged.actions.every(({ operation }) => operation === 'noop')).toBe(true);

  const identitiesBeforeRestart = resourceIdentities(firstUp.resources);
  const down = requireSuccess(
    await downInfraEnvironmentAsync(
      { projectId, manifest, environment: 'production', previous: firstLedger },
      dependencies,
    ),
  );
  const { ledger: downLedger } = down;
  expect(fixture.k3s.state).toBe('stopped');

  const resumed = requireSuccess(
    await upInfraEnvironmentAsync(
      { projectId, manifest, environment: 'production', previous: downLedger },
      dependencies,
    ),
  );
  const { ledger: resumedLedger } = resumed;
  expect(fixture.k3s.state).toBe('ready');
  expect(resourceIdentities(resumed.resources)).toEqual(identitiesBeforeRestart);

  const retained = requireSuccess(
    await destroyInfraEnvironmentAsync(
      {
        projectId,
        manifest,
        environment: 'production',
        previous: resumedLedger,
        confirmation: { projectId, environment: 'production' },
        persistence: { policy: 'retain' },
      },
      dependencies,
    ),
  );
  expect(retained.ledger).not.toBeNull();
  expect(retained.ledger?.targets).toEqual(firstUp.targets);
  expect(retained.ledger?.resources.some(({ persistent }) => persistent)).toBe(true);
  expect(fixture.hetzner.destroyed).toEqual([]);
  expect(fixture.k3s.calls).not.toContain('destroy');
});

class ProductionFixture {
  readonly hetzner = new FakeHetznerCloudApi();
  readonly hostKeyProbe = new FakeHostKeyProbe();
  readonly k3s = new FakeK3sControlPlane();
  readonly kubernetes = this.k3s.api;
  readonly supabase = new FakeSupabaseControlPlane();
}

function createDependencies(fixture: ProductionFixture): InfraOrchestrationDependencies {
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
  if (name === 'S3_PERSISTENCE') {
    return success({ accessKeyId: 'phase10-s3-access', secretAccessKey: 'phase10-s3-secret-key' });
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
  readonly destroyed: HetznerResourceId[] = [];

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
    this.destroyed.push(...resourceIds);
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
