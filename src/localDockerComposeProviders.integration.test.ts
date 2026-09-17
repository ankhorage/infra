import { createHash } from 'node:crypto';

import type {
  InfraControlPlaneCredentialRef,
  InfraCredentialPort,
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
const bootstrapCredential = { source: 'control-plane', name: 'SUPABASE_BOOTSTRAP' } as const;
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
    const credentialPort = new MemoryCredentialPort();
    const dependencies = createDependencies(credentialPort);
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
      expect(credentialPort.persistCount).toBe(1);
      const firstCredentials = credentialPort.readRequired();
      const firstCredentialFingerprint = credentialFingerprint(firstCredentials);
      assertProviderNeutralOutputs(firstOutputs, firstCredentials);

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
      expect(credentialPort.persistCount).toBe(1);
      expect(credentialFingerprint(credentialPort.readRequired())).toBe(firstCredentialFingerprint);
      assertProviderNeutralOutputs(resumedOutputs, firstCredentials);

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

function createDependencies(credentials: InfraCredentialPort): InfraOrchestrationDependencies {
  return {
    adapterResolver: createNodeInfraAdapterPackageResolver(),
    credentials,
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
        'unexpected-control-plane-credential',
        `Unexpected or missing control-plane credential ${reference.name}.`,
      ),
    );
  }

  persistAsync(
    reference: InfraControlPlaneCredentialRef,
    values: Readonly<Record<string, string>>,
  ): Promise<InfraResult<null>> {
    if (reference.name !== bootstrapCredential.name) {
      return Promise.resolve(
        failure(
          'unexpected-control-plane-credential',
          `Unexpected control-plane credential ${reference.name}.`,
        ),
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

function readAnonKey(values: Readonly<Record<string, string>>): string {
  const { anonKey } = values;
  if (anonKey === undefined) throw new Error('Expected generated Supabase anonKey.');
  return anonKey;
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

function assertProviderNeutralOutputs(
  outputs: InfraLedger['outputs'],
  credentials: Readonly<Record<string, string>>,
): void {
  const serialized = JSON.stringify(outputs);
  for (const secret of privilegedCredentialValues(credentials)) {
    expect(serialized).not.toContain(secret);
  }
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
        value === readAnonKey(credentials),
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
