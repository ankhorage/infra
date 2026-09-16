import type {
  InfraComputeAdapter,
  InfraComputeSnapshot,
  InfraManifest,
  InfraPlanAction,
  InfraReconcileResult,
  InfraResourceStatus,
  InfraResult,
} from '@ankhorage/contracts/infra';
import { infraAdapterDescriptor as hetznerInfraAdapterDescriptor } from '@ankhorage/hetzner';
import {
  createInfraAdapter as createK3sInfraAdapter,
  infraAdapterDescriptor as k3sInfraAdapterDescriptor,
  type K3sClusterObservation,
  type K3sClusterSpec,
  type K3sControlPlane,
  type K3sNodeAccess,
} from '@ankhorage/k3s';
import { expect, test } from 'bun:test';

import { type InfraOrchestrationDependencies, upInfraEnvironmentAsync } from './index.js';

const projectId = 'infra162-server-runtime-environment';
const serverImage = 'example/server:production';

const manifest = {
  environments: {
    local: {
      deployment: {
        compute: { provider: 'local' },
        runtime: { provider: 'docker-compose' },
      },
    },
    preview: {
      deployment: {
        compute: { provider: 'hetzner', location: 'fsn1' },
        runtime: { provider: 'k3s', topology: { servers: 1, agents: 0 } },
      },
      workloads: [serverWorkload('development')],
    },
    production: {
      deployment: {
        compute: { provider: 'hetzner', location: 'fsn1' },
        runtime: { provider: 'k3s', topology: { servers: 1, agents: 0 } },
      },
      workloads: [serverWorkload('production')],
    },
  },
  modules: [],
} as const satisfies InfraManifest;

test('projects explicit production server environment through the generic k3s workload path', async () => {
  const fixture = new ProductionServerFixture();
  const dependencies = createDependencies(fixture);

  const first = requireSuccess(
    await upInfraEnvironmentAsync({ projectId, manifest, environment: 'production' }, dependencies),
  );
  const firstProjection = fixture.kubernetes.serializedResources();

  expect(first.environment).toBe('production');
  expect(firstProjection).toContain('"name":"NODE_ENV","value":"production"');
  expect(fixture.k3s.loadedImages).toEqual([serverImage]);

  requireSuccess(
    await upInfraEnvironmentAsync(
      {
        projectId,
        manifest,
        environment: 'production',
        previous: first.ledger,
      },
      dependencies,
    ),
  );

  expect(fixture.kubernetes.serializedResources()).toBe(firstProjection);
});

test('preserves an explicitly non-production server environment without rewriting it', async () => {
  const fixture = new ProductionServerFixture();

  const result = requireSuccess(
    await upInfraEnvironmentAsync(
      { projectId, manifest, environment: 'preview' },
      createDependencies(fixture),
    ),
  );
  const projection = fixture.kubernetes.serializedResources();

  expect(result.environment).toBe('preview');
  expect(projection).toContain('"name":"NODE_ENV","value":"development"');
  expect(projection).not.toContain('"name":"NODE_ENV","value":"production"');
});

function serverWorkload(nodeEnvironment: 'development' | 'production') {
  return {
    id: 'server',
    artifact: { kind: 'image' as const, image: serverImage },
    environment: {
      NODE_ENV: { kind: 'literal' as const, value: nodeEnvironment },
    },
  };
}

class ProductionServerFixture {
  readonly compute = new FakeHetznerComputeAdapter();
  readonly k3s = new FakeK3sControlPlane();
  readonly kubernetes = this.k3s.api;
}

function createDependencies(fixture: ProductionServerFixture): InfraOrchestrationDependencies {
  return {
    adapterResolver: {
      loadAsync: (packageName) => {
        switch (packageName) {
          case hetznerInfraAdapterDescriptor.package:
            return Promise.resolve({
              infraAdapterDescriptor: hetznerInfraAdapterDescriptor,
              createInfraAdapter: () => fixture.compute,
            });
          case k3sInfraAdapterDescriptor.package:
            return Promise.resolve({
              infraAdapterDescriptor: k3sInfraAdapterDescriptor,
              createInfraAdapter: () => createK3sInfraAdapter({ controlPlane: fixture.k3s }),
            });
          default:
            return Promise.reject(new Error(`Unexpected adapter package: ${packageName}`));
        }
      },
    },
    credentials: {
      resolveAsync: () => Promise.resolve(success({ token: 'fixture-token' })),
    },
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

class FakeHetznerComputeAdapter implements InfraComputeAdapter<'hetzner'> {
  readonly descriptor = hetznerInfraAdapterDescriptor;
  readonly snapshot: InfraComputeSnapshot = {
    targets: [
      {
        id: 'server',
        kind: 'ssh-host',
        os: 'linux',
        architecture: 'amd64',
        host: '203.0.113.162',
        port: 22,
        user: 'root',
        credential: { source: 'control-plane', name: 'SERVER_SSH' },
        hostKeyFingerprint: 'SHA256:infra162-server',
      },
    ],
    resources: [],
    outputs: [],
  };

  validateAsync(): Promise<InfraResult<null>> {
    return Promise.resolve(success(null));
  }

  inspectAsync(): Promise<InfraResult<InfraComputeSnapshot>> {
    return Promise.resolve(success(this.snapshot));
  }

  planAsync(): Promise<InfraResult<readonly InfraPlanAction[]>> {
    return Promise.resolve(success([]));
  }

  ensureAsync(): Promise<InfraResult<InfraComputeSnapshot>> {
    return Promise.resolve(success(this.snapshot));
  }

  statusAsync(): Promise<InfraResult<readonly InfraResourceStatus[]>> {
    return Promise.resolve(success([]));
  }

  destroyAsync(): Promise<InfraResult<InfraReconcileResult>> {
    return Promise.resolve(success({ resources: [], outputs: [] }));
  }
}

type KubernetesApi = NonNullable<K3sClusterObservation['api']>;
type KubernetesOwnershipQuery = Parameters<KubernetesApi['listOwnedAsync']>[0];
type KubernetesResource = Awaited<ReturnType<KubernetesApi['listOwnedAsync']>>[number];
type KubernetesResourceReference = Parameters<KubernetesApi['deleteAsync']>[0];
type KubernetesResourceObservation = Awaited<ReturnType<KubernetesApi['observeAsync']>>;

class FakeK3sControlPlane implements K3sControlPlane {
  readonly api = new FakeKubernetesApi();
  loadedImages: readonly string[] = [];
  state: K3sClusterObservation['state'] = 'absent';
  nodes: K3sClusterObservation['nodes'] = [];

  validateAsync(): Promise<InfraResult<null>> {
    return Promise.resolve(success(null));
  }

  inspectAsync(): Promise<InfraResult<K3sClusterObservation>> {
    return Promise.resolve(success(this.observation()));
  }

  ensureAsync(spec: K3sClusterSpec): Promise<InfraResult<K3sClusterObservation>> {
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
    images: readonly string[],
  ): Promise<InfraResult<null>> {
    this.loadedImages = [...images];
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

  observeAsync(): Promise<KubernetesResourceObservation> {
    return Promise.resolve({ state: 'ready' });
  }

  waitUntilReadyAsync(): Promise<KubernetesResourceObservation> {
    return Promise.resolve({ state: 'ready' });
  }

  serializedResources(): string {
    return JSON.stringify(this.resources);
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
