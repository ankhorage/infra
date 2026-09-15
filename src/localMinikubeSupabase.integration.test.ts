import { createHmac } from 'node:crypto';

import type {
  InfraLedger,
  InfraManifest,
  InfraResourceIdentity,
  InfraResult,
} from '@ankhorage/contracts/infra';
import { expect, test } from 'bun:test';

import { createNodeInfraAdapterPackageResolver } from './features/environment-lifecycle/adapters/outbound/createNodeInfraAdapterPackageResolver.js';
import { destroyInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/destroyInfraEnvironmentAsync.js';
import { downInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/downInfraEnvironmentAsync.js';
import { planInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/planInfraEnvironmentAsync.js';
import { statusInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/statusInfraEnvironmentAsync.js';
import { upInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/upInfraEnvironmentAsync.js';
import type { InfraOrchestrationDependencies } from './types/infraOrchestration.js';

const projectId = 'infra145-minikube-supabase';
const namespace = `${projectId}-local`;
const baseUrl = 'http://127.0.0.1:54321';
const bucket = 'phase8-acceptance';
const staleWorkloadId = 'phase8-stale';
const externalConfigMap = 'phase8-external';
const jwtSecret = 'phase8-jwt-secret-that-is-at-least-thirty-two-characters';
const credentials = {
  postgresPassword: 'phase8-postgres-password',
  jwtSecret,
  anonKey: createJwt('anon'),
  serviceRoleKey: createJwt('service_role'),
  realtimeSecretKeyBase: 'r'.repeat(64),
  realtimeDatabaseEncryptionKey: '0123456789abcdef',
  pgMetaCryptoKey: 'phase8-meta-crypto-key-that-is-at-least-32-characters',
} as const;
const manifest = {
  environments: {
    local: {
      deployment: {
        compute: { provider: 'local' },
        runtime: {
          provider: 'minikube',
          profile: projectId,
          driver: 'docker',
          cpus: 2,
          memoryMiB: 5_120,
        },
      },
      database: { provider: 'supabase', tier: 'dev' },
      auth: { provider: 'supabase' },
      objectStorage: { provider: 'supabase', buckets: [bucket] },
      networking: { publicBaseUrl: baseUrl },
    },
  },
  modules: [],
} as const satisfies InfraManifest;
const initialManifest = {
  ...manifest,
  environments: {
    ...manifest.environments,
    local: {
      ...manifest.environments.local,
      workloads: [
        {
          id: staleWorkloadId,
          artifact: { kind: 'image', image: 'nginx:alpine' },
          ports: [{ name: 'http', port: 80 }],
          health: { kind: 'tcp', port: 80 },
          exposure: 'internal',
        },
      ],
    },
  },
} as const satisfies InfraManifest;

test.skipIf(process.env.ANKH_INFRA_MINIKUBE_SUPABASE_E2E !== '1')(
  'runs local Minikube and Supabase through the provider-neutral lifecycle',
  async () => {
    const dependencies = createDependencies();
    let ledger: InfraLedger | undefined;

    try {
      const initialPlan = requireSuccess(
        await planInfraEnvironmentAsync({ projectId, manifest: initialManifest }, dependencies),
      );
      expect(initialPlan.actions.some(({ operation }) => operation === 'create')).toBe(true);

      const { ledger: firstLedger, outputs: firstOutputs } = requireSuccess(
        await upInfraEnvironmentAsync({ projectId, manifest: initialManifest }, dependencies),
      );
      ledger = firstLedger;
      assertSafePublicOutputs(firstOutputs);
      expect(
        firstOutputs.some(
          ({ owner, name, value }) =>
            owner.adapter === 'minikube' && name === 'localUrl' && value === baseUrl,
        ),
      ).toBe(true);
      expect(
        firstOutputs.some(
          ({ environmentVariable, value }) =>
            environmentVariable === 'EXPO_PUBLIC_SUPABASE_URL' && value === baseUrl,
        ),
      ).toBe(true);
      expect(firstOutputs.some(({ name, value }) => name === 'bucket' && value === bucket)).toBe(
        true,
      );

      await runKubectlAsync([
        'create',
        'configmap',
        externalConfigMap,
        '--namespace',
        namespace,
        '--from-literal=owner=external',
      ]);
      expect(await kubernetesResourceExistsAsync('deployment', staleWorkloadId)).toBe(true);
      expect(await kubernetesResourceExistsAsync('configmap', externalConfigMap)).toBe(true);

      const stalePlan = requireSuccess(
        await planInfraEnvironmentAsync({ projectId, manifest, previous: ledger }, dependencies),
      );
      expect(stalePlan.actions.some(({ operation }) => operation === 'delete')).toBe(true);

      const pruned = requireSuccess(
        await upInfraEnvironmentAsync({ projectId, manifest, previous: ledger }, dependencies),
      );
      ledger = pruned.ledger;
      expect(await kubernetesResourceExistsAsync('deployment', staleWorkloadId)).toBe(false);
      expect(await kubernetesResourceExistsAsync('configmap', externalConfigMap)).toBe(true);

      const status = requireSuccess(
        await statusInfraEnvironmentAsync({ projectId, manifest, previous: ledger }, dependencies),
      );
      expect(status.state).toBe('ready');

      const convergedPlan = requireSuccess(
        await planInfraEnvironmentAsync({ projectId, manifest, previous: ledger }, dependencies),
      );
      expect(convergedPlan.actions.every(({ operation }) => operation === 'noop')).toBe(true);

      const { ledger: downLedger } = requireSuccess(
        await downInfraEnvironmentAsync({ projectId, manifest, previous: ledger }, dependencies),
      );
      ledger = downLedger;

      const { ledger: resumedLedger, outputs: resumedOutputs } = requireSuccess(
        await upInfraEnvironmentAsync({ projectId, manifest, previous: ledger }, dependencies),
      );
      ledger = resumedLedger;
      assertSafePublicOutputs(resumedOutputs);

      const health = await fetch(`${baseUrl}/auth/v1/health`);
      expect(health.ok).toBe(true);

      const destroyed = requireSuccess(
        await destroyInfraEnvironmentAsync(
          createDestroyRequest(ledger, persistentIdentities(ledger)),
          dependencies,
        ),
      );
      ledger = destroyed.ledger ?? undefined;
      expect(destroyed.ledger).toBeNull();
    } finally {
      if (ledger !== undefined) {
        await destroyInfraEnvironmentAsync(
          createDestroyRequest(ledger, persistentIdentities(ledger)),
          dependencies,
        );
      }
    }
  },
  900_000,
);

function createDependencies(): InfraOrchestrationDependencies {
  return {
    adapterResolver: createNodeInfraAdapterPackageResolver(),
    credentials: {
      resolveAsync: (reference) =>
        Promise.resolve(
          reference.name === 'SUPABASE_BOOTSTRAP'
            ? success(credentials)
            : failure(
                'unexpected-control-plane-credential',
                `Unexpected control-plane credential ${reference.name}.`,
              ),
        ),
    },
    secrets: {
      resolveAsync: (reference) =>
        Promise.resolve(
          failure(
            'unexpected-managed-secret',
            `Unexpected managed secret ${reference.ref}/${reference.key}.`,
          ),
        ),
    },
  };
}

function createDestroyRequest(
  previous: InfraLedger,
  confirmedResources: readonly InfraResourceIdentity[],
) {
  return {
    projectId,
    manifest,
    environment: 'local' as const,
    previous,
    confirmation: { projectId, environment: 'local' as const },
    persistence: { policy: 'delete' as const, confirmedResources },
  };
}

function persistentIdentities(ledger: InfraLedger): readonly InfraResourceIdentity[] {
  return ledger.resources.filter(({ persistent }) => persistent).map(({ identity }) => identity);
}

async function kubernetesResourceExistsAsync(kind: string, name: string): Promise<boolean> {
  const output = await runKubectlAsync([
    'get',
    `${kind}/${name}`,
    '--namespace',
    namespace,
    '--ignore-not-found=true',
    '-o',
    'name',
  ]);
  return output.length > 0;
}

async function runKubectlAsync(arguments_: readonly string[]): Promise<string> {
  const process = Bun.spawn(['kubectl', '--context', projectId, ...arguments_], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`kubectl command failed: ${stderr.trim()}`);
  }
  return stdout.trim();
}

function assertSafePublicOutputs(outputs: InfraLedger['outputs']): void {
  const serialized = JSON.stringify(outputs);
  expect(serialized).not.toContain(credentials.serviceRoleKey);
  expect(serialized).not.toContain(credentials.postgresPassword);
  expect(serialized).not.toContain(credentials.jwtSecret);
  expect(serialized).not.toContain(credentials.realtimeSecretKeyBase);
  expect(serialized).not.toContain(credentials.realtimeDatabaseEncryptionKey);
  expect(serialized).not.toContain(credentials.pgMetaCryptoKey);
  expect(
    outputs.some(
      ({ environmentVariable, value }) =>
        environmentVariable === 'EXPO_PUBLIC_SUPABASE_ANON_KEY' && value === credentials.anonKey,
    ),
  ).toBe(true);
}

function createJwt(role: 'anon' | 'service_role'): string {
  const encodedHeader = encodeJwtPart({ alg: 'HS256', typ: 'JWT' });
  const encodedPayload = encodeJwtPart({
    role,
    iss: 'supabase',
    iat: 1_700_000_000,
    exp: 4_102_444_800,
  });
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', jwtSecret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function encodeJwtPart(value: Readonly<Record<string, string | number>>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
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
