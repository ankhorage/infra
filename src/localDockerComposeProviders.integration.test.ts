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

const projectId = 'infra145-compose-providers';
const baseUrl = 'http://127.0.0.1:54322';
const bucket = 'phase9-acceptance';
const jwtSecret = 'phase9-jwt-secret-that-is-at-least-thirty-two-characters';
const credentials = {
  postgresPassword: 'phase9-postgres-password',
  jwtSecret,
  anonKey: createJwt('anon'),
  serviceRoleKey: createJwt('service_role'),
  realtimeSecretKeyBase: 'r'.repeat(64),
  realtimeDatabaseEncryptionKey: '0123456789abcdef',
  pgMetaCryptoKey: 'phase9-meta-crypto-key-that-is-at-least-32-characters',
} as const;
const manifest = {
  environments: {
    local: {
      deployment: {
        compute: { provider: 'local' },
        runtime: { provider: 'docker-compose', projectName: projectId },
      },
      database: { provider: 'supabase', tier: 'dev' },
      auth: { provider: 'supabase' },
      objectStorage: { provider: 'supabase', buckets: [bucket] },
      authz: {
        provider: 'cerbos',
        kind: 'ABAC',
        policies: [
          {
            path: 'phase9.yaml',
            content:
              'apiVersion: api.cerbos.dev/v1\nresourcePolicy:\n  version: default\n  resource: phase9\n  rules: []\n',
          },
        ],
      },
      networking: { publicBaseUrl: baseUrl },
    },
  },
  modules: [],
} as const satisfies InfraManifest;

test.skipIf(process.env.ANKH_INFRA_DOCKER_COMPOSE_PROVIDERS_E2E !== '1')(
  'runs Supabase and Cerbos through the provider-neutral Docker Compose lifecycle',
  async () => {
    const dependencies = createDependencies();
    let ledger: InfraLedger | undefined;

    try {
      const initialPlan = requireSuccess(
        await planInfraEnvironmentAsync({ projectId, manifest }, dependencies),
      );
      expect(initialPlan.actions.some(({ operation }) => operation === 'create')).toBe(true);

      const { ledger: firstLedger, outputs: firstOutputs } = requireSuccess(
        await upInfraEnvironmentAsync({ projectId, manifest }, dependencies),
      );
      ledger = firstLedger;
      assertProviderNeutralOutputs(firstOutputs);

      const status = requireSuccess(
        await statusInfraEnvironmentAsync({ projectId, manifest, previous: ledger }, dependencies),
      );
      expect(status.state).toBe('ready');
      expect(
        status.resources
          .filter(({ owner }) => ['docker-compose', 'supabase', 'cerbos'].includes(owner.adapter))
          .every(({ state }) => state === 'ready'),
      ).toBe(true);

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
      assertProviderNeutralOutputs(resumedOutputs);

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

function assertProviderNeutralOutputs(outputs: InfraLedger['outputs']): void {
  const serialized = JSON.stringify(outputs);
  expect(serialized).not.toContain(credentials.serviceRoleKey);
  expect(serialized).not.toContain(credentials.postgresPassword);
  expect(serialized).not.toContain(credentials.jwtSecret);
  expect(serialized).not.toContain(credentials.realtimeSecretKeyBase);
  expect(serialized).not.toContain(credentials.realtimeDatabaseEncryptionKey);
  expect(serialized).not.toContain(credentials.pgMetaCryptoKey);
  expect(serialized.toLowerCase()).not.toContain('kubernetes');
  expect(serialized.toLowerCase()).not.toContain('minikube');
  expect(
    outputs.some(
      ({ owner, environmentVariable, value }) =>
        owner.adapter === 'supabase' &&
        environmentVariable === 'EXPO_PUBLIC_SUPABASE_URL' &&
        value === baseUrl,
    ),
  ).toBe(true);
  expect(
    outputs.some(
      ({ owner, environmentVariable, value }) =>
        owner.adapter === 'supabase' &&
        environmentVariable === 'EXPO_PUBLIC_SUPABASE_ANON_KEY' &&
        value === credentials.anonKey,
    ),
  ).toBe(true);
  expect(
    outputs.some(
      ({ owner, name, value }) =>
        owner.adapter === 'supabase' && name === 'bucket' && value === bucket,
    ),
  ).toBe(true);
  expect(
    outputs.some(
      ({ owner, environmentVariable, value }) =>
        owner.adapter === 'cerbos' &&
        environmentVariable === 'CERBOS_URL' &&
        value === 'http://cerbos:3592',
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
