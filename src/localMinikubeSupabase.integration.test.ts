import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  InfraLedger,
  InfraManifest,
  InfraResourceIdentity,
  InfraResult,
} from '@ankhorage/contracts/infra';
import { expect, test } from 'bun:test';

import { createProjectInfraCredentialPort } from './features/environment-lifecycle/adapters/outbound/createProjectInfraCredentialPort.js';
import { createProjectInfraLifecycle } from './project/index.js';

const projectId = 'infra145-minikube-supabase';
const acceptanceNamespace = `${projectId}-local`;
const baseUrl = 'http://127.0.0.1:54321';
const bucket = 'phase8-acceptance';
const staleOwnedConfigMap = 'phase8-stale-owned';
const unrelatedConfigMap = 'phase8-unrelated';
const staleOwnedResourceId = 'stale:phase8-owned';
const bootstrapCredential = {
  source: 'control-plane',
  name: 'SUPABASE_BOOTSTRAP',
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

test.skipIf(process.env.ANKH_INFRA_MINIKUBE_SUPABASE_E2E !== '1')(
  'bootstraps fresh local Minikube and Supabase through the project lifecycle',
  async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ankh-infra170-minikube-'));
    const isolatedProjectPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ankh-infra170-isolated-'),
    );
    const request = createOperationRequest(projectPath);
    let ledger: InfraLedger | undefined;
    let destroyed = false;

    try {
      const firstLifecycle = createProjectInfraLifecycle();
      const initialPlan = requireSuccess(await firstLifecycle.planAsync(request));
      expect(initialPlan.actions.some(({ operation }) => operation === 'create')).toBe(true);

      const firstUp = requireSuccess(await firstLifecycle.upAsync(request));
      ledger = firstUp.ledger;
      const firstCredentials = await resolveBootstrapCredentialsAsync(projectPath);
      const firstFingerprint = credentialFingerprint(firstCredentials);
      assertSafePublicOutputs(firstUp.outputs, firstCredentials);
      assertSecretFree(firstUp, firstCredentials);
      await assertStoredStateSecretFreeAsync(projectPath, firstCredentials);
      await assertCredentialFilePermissionsAsync(projectPath);
      expect(
        firstUp.outputs.some(
          ({ owner, name, value }) =>
            owner.adapter === 'minikube' && name === 'localUrl' && value === baseUrl,
        ),
      ).toBe(true);
      expect(
        firstUp.outputs.some(
          ({ environmentVariable, value }) =>
            environmentVariable === 'EXPO_PUBLIC_SUPABASE_URL' && value === baseUrl,
        ),
      ).toBe(true);
      expect(firstUp.outputs.some(({ name, value }) => name === 'bucket' && value === bucket)).toBe(
        true,
      );

      const secondLifecycle = createProjectInfraLifecycle();
      const status = requireSuccess(await secondLifecycle.statusAsync(request));
      expect(status.state).toBe('ready');

      const convergedPlan = requireSuccess(await secondLifecycle.planAsync(request));
      expect(convergedPlan.actions.every(({ operation }) => operation === 'noop')).toBe(true);
      assertSecretFree(convergedPlan, firstCredentials);

      const secondUp = requireSuccess(await secondLifecycle.upAsync(request));
      ledger = secondUp.ledger;
      expect(credentialFingerprint(await resolveBootstrapCredentialsAsync(projectPath))).toBe(
        firstFingerprint,
      );
      expect(resourceIdentities(secondUp.resources)).toEqual(resourceIdentities(firstUp.resources));

      await createStaleOwnershipFixturesAsync();
      const stalePlan = requireSuccess(await secondLifecycle.planAsync(request));
      expect(
        stalePlan.actions.some(
          ({ operation, owner }) =>
            operation === 'delete' && owner.resourceId === staleOwnedResourceId,
        ),
      ).toBe(true);

      const pruned = requireSuccess(await secondLifecycle.upAsync(request));
      ledger = pruned.ledger;
      expect(await configMapExistsAsync(staleOwnedConfigMap)).toBe(false);
      expect(await configMapExistsAsync(unrelatedConfigMap)).toBe(true);
      await runKubectlAsync([
        'delete',
        'configmap',
        unrelatedConfigMap,
        '--namespace',
        acceptanceNamespace,
        '--ignore-not-found=true',
      ]);

      const down = requireSuccess(await secondLifecycle.downAsync(request));
      ledger = down.ledger;
      expect(credentialFingerprint(await resolveBootstrapCredentialsAsync(projectPath))).toBe(
        firstFingerprint,
      );

      const resumedLifecycle = createProjectInfraLifecycle();
      const resumed = requireSuccess(await resumedLifecycle.upAsync(request));
      ledger = resumed.ledger;
      expect(credentialFingerprint(await resolveBootstrapCredentialsAsync(projectPath))).toBe(
        firstFingerprint,
      );
      assertSafePublicOutputs(resumed.outputs, firstCredentials);
      assertSecretFree(resumed, firstCredentials);
      await assertStoredStateSecretFreeAsync(projectPath, firstCredentials);

      const health = await fetch(`${baseUrl}/auth/v1/health`);
      expect(health.ok).toBe(true);

      const isolatedPort = createProjectInfraCredentialPort({
        projectPath: isolatedProjectPath,
        environment: 'local',
        processEnvironment: {},
      });
      expect(await isolatedPort.persistAsync(bootstrapCredential, firstCredentials)).toMatchObject({
        ok: true,
      });
      const isolatedFingerprint = credentialFingerprint(
        requireSuccess(await isolatedPort.resolveAsync(bootstrapCredential)),
      );

      const destroyResult = requireSuccess(
        await resumedLifecycle.destroyAsync(createDestroyRequest(projectPath, ledger)),
      );
      ledger = undefined;
      destroyed = true;
      expect(destroyResult.ledger).toBeNull();
      expect(await findBootstrapCredentialsAsync(projectPath)).toBeNull();
      expect(
        credentialFingerprint(requireSuccess(await isolatedPort.resolveAsync(bootstrapCredential))),
      ).toBe(isolatedFingerprint);
    } finally {
      if (!destroyed && ledger !== undefined) {
        await createProjectInfraLifecycle().destroyAsync(createDestroyRequest(projectPath, ledger));
      }
      await fs.rm(projectPath, { recursive: true, force: true });
      await fs.rm(isolatedProjectPath, { recursive: true, force: true });
    }
  },
  900_000,
);

async function createStaleOwnershipFixturesAsync(): Promise<void> {
  await runKubectlAsync([
    'create',
    'configmap',
    staleOwnedConfigMap,
    '--namespace',
    acceptanceNamespace,
    '--from-literal=marker=stale',
  ]);
  await runKubectlAsync([
    'label',
    'configmap',
    staleOwnedConfigMap,
    '--namespace',
    acceptanceNamespace,
    'app.kubernetes.io/managed-by=ankhorage-infra',
    `infra.ankhorage.dev/project=${projectId}`,
    'infra.ankhorage.dev/environment=local',
  ]);
  await runKubectlAsync([
    'annotate',
    'configmap',
    staleOwnedConfigMap,
    '--namespace',
    acceptanceNamespace,
    `infra.ankhorage.dev/project-id=${projectId}`,
    'infra.ankhorage.dev/environment=local',
    'infra.ankhorage.dev/adapter=minikube',
    `infra.ankhorage.dev/resource-id=${staleOwnedResourceId}`,
    'infra.ankhorage.dev/persistent=false',
    'infra.ankhorage.dev/retention=retain',
    'infra.ankhorage.dev/depends-on=[]',
  ]);
  await runKubectlAsync([
    'create',
    'configmap',
    unrelatedConfigMap,
    '--namespace',
    acceptanceNamespace,
    '--from-literal=marker=unrelated',
  ]);
}

async function configMapExistsAsync(name: string): Promise<boolean> {
  const output = await runKubectlAsync([
    'get',
    'configmap',
    name,
    '--namespace',
    acceptanceNamespace,
    '--ignore-not-found=true',
    '--output=name',
  ]);
  return output === `configmap/${name}`;
}

async function runKubectlAsync(args: readonly string[]): Promise<string> {
  const process = Bun.spawn(['kubectl', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`kubectl ${args.join(' ')} failed: ${stderr.trim()}`);
  }
  return stdout.trim();
}

function createOperationRequest(projectPath: string) {
  return {
    projectId,
    projectPath,
    manifest,
    environment: 'local' as const,
    executionEnvironment: {},
  };
}

function createDestroyRequest(projectPath: string, previous: InfraLedger) {
  return {
    ...createOperationRequest(projectPath),
    confirmation: { projectId, environment: 'local' as const },
    persistence: {
      policy: 'delete' as const,
      confirmedResources: persistentIdentities(previous),
    },
  };
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

async function resolveBootstrapCredentialsAsync(
  projectPath: string,
): Promise<Readonly<Record<string, string>>> {
  const port = createProjectInfraCredentialPort({
    projectPath,
    environment: 'local',
    processEnvironment: {},
  });
  return requireSuccess(await port.resolveAsync(bootstrapCredential));
}

async function findBootstrapCredentialsAsync(
  projectPath: string,
): Promise<Readonly<Record<string, string>> | null> {
  const port = createProjectInfraCredentialPort({
    projectPath,
    environment: 'local',
    processEnvironment: {},
  });
  return requireSuccess(await port.findAsync(bootstrapCredential));
}

function credentialFingerprint(values: Readonly<Record<string, string>>): string {
  const canonical = Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}\u0000${value}`)
    .join('\u0001');
  return createHash('sha256').update(canonical).digest('hex');
}

function privilegedCredentialValues(
  values: Readonly<Record<string, string>>,
): readonly string[] {
  const { anonKey: _anonKey, ...privileged } = values;
  return Object.values(privileged);
}

function assertSafePublicOutputs(
  outputs: InfraLedger['outputs'],
  credentials: Readonly<Record<string, string>>,
): void {
  const serialized = JSON.stringify(outputs);
  for (const value of privilegedCredentialValues(credentials)) {
    expect(serialized).not.toContain(value);
  }
  const { anonKey } = credentials;
  if (anonKey === undefined) throw new Error('Expected generated Supabase anonKey.');
  expect(
    outputs.some(
      ({ environmentVariable, value }) =>
        environmentVariable === 'EXPO_PUBLIC_SUPABASE_ANON_KEY' && value === anonKey,
    ),
  ).toBe(true);
}

function assertSecretFree(
  value: unknown,
  credentials: Readonly<Record<string, string>>,
): void {
  const serialized = JSON.stringify(value);
  for (const secret of privilegedCredentialValues(credentials)) {
    expect(serialized).not.toContain(secret);
  }
}

async function assertStoredStateSecretFreeAsync(
  projectPath: string,
  credentials: Readonly<Record<string, string>>,
): Promise<void> {
  const state = await fs.readFile(
    path.join(projectPath, '.ankh', 'infra', 'local', 'state.json'),
    'utf8',
  );
  for (const secret of privilegedCredentialValues(credentials)) {
    expect(state).not.toContain(secret);
  }
}

async function assertCredentialFilePermissionsAsync(projectPath: string): Promise<void> {
  if (process.platform === 'win32') return;
  const digest = createHash('sha256').update(bootstrapCredential.name).digest('hex');
  const credentialPath = path.join(
    projectPath,
    '.ankh',
    'infra',
    'local',
    'credentials',
    `${digest}.json`,
  );
  expect((await fs.stat(credentialPath)).mode & 0o777).toBe(0o600);
}

function requireSuccess<T>(result: InfraResult<T>): T {
  if (!result.ok) throw new Error(result.diagnostics.map(({ message }) => message).join(' '));
  return result.value;
}
