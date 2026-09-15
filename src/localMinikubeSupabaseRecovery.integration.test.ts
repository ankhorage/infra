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
import { upInfraEnvironmentAsync } from './features/environment-lifecycle/application/use-cases/upInfraEnvironmentAsync.js';
import type { InfraOrchestrationDependencies } from './types/infraOrchestration.js';

const projectId = 'infra145-minikube-supabase-recovery';
const profile = projectId;
const namespace = `${projectId}-local`;
const baseUrl = 'http://127.0.0.1:54322';
const logicalBucket = 'phase10-objects';
const physicalBucket = 'phase10-persistence';
const minioContainer = 'infra145-minio-recovery';
const minioHostEndpoint = 'http://127.0.0.1:19000';
const minioPodEndpoint = 'http://host.minikube.internal:19000';
const minioImage = 'quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z';
const s3AccessKey = 'phase10-access';
const s3SecretKey = 'phase10-secret-key';
const databaseMarker = 'database-survived-from-s3-backup';
const objectMarker = 'storage-object-survived-off-cluster';
const jwtSecret = 'phase10-jwt-secret-that-is-at-least-thirty-two-characters';
const serviceRoleKey = createJwt('service_role');
const persistenceTarget = {
  endpoint: minioPodEndpoint,
  region: 'us-east-1',
  bucket: physicalBucket,
  credentials: { source: 'control-plane', name: 'S3_PERSISTENCE' },
  forcePathStyle: true,
} as const;
const manifest = {
  environments: {
    local: {
      deployment: {
        compute: { provider: 'local' },
        runtime: {
          provider: 'minikube',
          profile,
          driver: 'docker',
          cpus: 2,
          memoryMiB: 5_120,
        },
      },
      database: {
        provider: 'supabase',
        tier: 'prod',
        backup: { mode: 'scheduled', target: persistenceTarget, intervalHours: 24 },
      },
      auth: { provider: 'supabase' },
      objectStorage: {
        provider: 'supabase',
        buckets: [logicalBucket],
        backend: persistenceTarget,
      },
      networking: { publicBaseUrl: baseUrl },
    },
  },
  modules: [],
} as const satisfies InfraManifest;

test.skipIf(process.env.ANKH_INFRA_MINIKUBE_SUPABASE_RECOVERY_E2E !== '1')(
  'recovers a fresh Minikube Supabase database while S3-backed Storage remains off-cluster',
  async () => {
    await stopMinioAsync();
    await startMinioAsync();
    try {
      const dependencies = createDependencies();
      const firstUp = requireSuccess(
        await upInfraEnvironmentAsync({ projectId, manifest }, dependencies),
      );
      await writeDatabaseMarkerAsync();
      await uploadStorageObjectAsync();
      await forceFreshBackupAsync();
      expect(await readLatestBackupPointerAsync()).toMatch(/^database\/.+\.dump$/);

      const destroyed = requireSuccess(
        await destroyInfraEnvironmentAsync(
          createDestroyRequest(firstUp.ledger, persistentIdentities(firstUp.ledger)),
          dependencies,
        ),
      );
      expect(destroyed.ledger).toBeNull();

      const recovered = requireSuccess(
        await upInfraEnvironmentAsync({ projectId, manifest }, dependencies),
      );
      expect(await readDatabaseMarkerAsync()).toBe(databaseMarker);
      expect(await downloadStorageObjectAsync()).toBe(objectMarker);

      const finalDestroy = requireSuccess(
        await destroyInfraEnvironmentAsync(
          createDestroyRequest(recovered.ledger, persistentIdentities(recovered.ledger)),
          dependencies,
        ),
      );
      expect(finalDestroy.ledger).toBeNull();
    } catch (error) {
      await dumpFailureDiagnosticsAsync();
      throw error;
    } finally {
      await runAllowFailureAsync(['minikube', 'delete', '-p', profile]);
      await stopMinioAsync();
    }
  },
  1_200_000,
);

async function startMinioAsync(): Promise<void> {
  await runAsync(
    [
      'docker',
      'run',
      '--detach',
      '--rm',
      '--name',
      minioContainer,
      '--publish',
      '19000:9000',
      '--env',
      `MINIO_ROOT_USER=${s3AccessKey}`,
      '--env',
      `MINIO_ROOT_PASSWORD=${s3SecretKey}`,
      minioImage,
      'server',
      '/data',
      '--address',
      ':9000',
    ],
    'start MinIO',
  );
  await waitForMinioAsync();
  await runAsync(
    [
      'curl',
      '--fail',
      '--silent',
      '--show-error',
      '--request',
      'PUT',
      '--aws-sigv4',
      'aws:amz:us-east-1:s3',
      '--user',
      `${s3AccessKey}:${s3SecretKey}`,
      `${minioHostEndpoint}/${physicalBucket}`,
    ],
    'create MinIO bucket',
  );
}

async function waitForMinioAsync(): Promise<void> {
  for (const _attempt of Array.from({ length: 60 }, (_, index) => index)) {
    const response = await fetch(`${minioHostEndpoint}/minio/health/live`).catch(() => undefined);
    if (response?.ok === true) return;
    await Bun.sleep(500);
  }
  throw new Error('MinIO did not become ready.');
}

async function stopMinioAsync(): Promise<void> {
  await runAllowFailureAsync(['docker', 'rm', '--force', minioContainer]);
}

async function writeDatabaseMarkerAsync(): Promise<void> {
  const pod = await findPodAsync('supabase-db-', 'supabase-db-backup-');
  await runAsync(
    [
      'kubectl',
      'exec',
      '--namespace',
      namespace,
      pod,
      '--',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `CREATE TABLE public.phase10_recovery_marker(value text NOT NULL); INSERT INTO public.phase10_recovery_marker(value) VALUES ('${databaseMarker}');`,
    ],
    'write database recovery marker',
  );
}

async function readDatabaseMarkerAsync(): Promise<string> {
  const pod = await findPodAsync('supabase-db-', 'supabase-db-backup-');
  return runAsync(
    [
      'kubectl',
      'exec',
      '--namespace',
      namespace,
      pod,
      '--',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-Atc',
      'SELECT value FROM public.phase10_recovery_marker LIMIT 1;',
    ],
    'read database recovery marker',
  );
}

async function uploadStorageObjectAsync(): Promise<void> {
  const response = await fetch(`${baseUrl}/storage/v1/object/${logicalBucket}/recovery.txt`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'text/plain',
    },
    body: objectMarker,
  });
  if (!response.ok) throw new Error(`Storage upload failed with HTTP ${response.status}.`);
}

async function downloadStorageObjectAsync(): Promise<string> {
  const response = await fetch(`${baseUrl}/storage/v1/object/${logicalBucket}/recovery.txt`, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!response.ok) throw new Error(`Storage download failed with HTTP ${response.status}.`);
  return response.text();
}

async function forceFreshBackupAsync(): Promise<void> {
  await runAsync(
    ['kubectl', 'rollout', 'restart', 'deployment/supabase-db-backup', '--namespace', namespace],
    'restart database backup workload',
  );
  await runAsync(
    [
      'kubectl',
      'rollout',
      'status',
      'deployment/supabase-db-backup',
      '--namespace',
      namespace,
      '--timeout=180s',
    ],
    'wait for database backup workload',
  );
}

async function readLatestBackupPointerAsync(): Promise<string> {
  return runAsync(
    [
      'curl',
      '--fail',
      '--silent',
      '--show-error',
      '--aws-sigv4',
      'aws:amz:us-east-1:s3',
      '--user',
      `${s3AccessKey}:${s3SecretKey}`,
      `${minioHostEndpoint}/${physicalBucket}/database/latest`,
    ],
    'read latest database backup pointer',
  );
}

async function findPodAsync(prefix: string, excludedPrefix?: string): Promise<string> {
  const names = (
    await runAsync(
      [
        'kubectl',
        'get',
        'pods',
        '--namespace',
        namespace,
        '-o',
        'jsonpath={.items[*].metadata.name}',
      ],
      'list Supabase pods',
    )
  ).split(' ');
  const name = names.find(
    (candidate) => candidate.startsWith(prefix) && !candidate.startsWith(excludedPrefix ?? '\0'),
  );
  if (name === undefined) throw new Error(`No pod matched ${prefix}.`);
  return name;
}

async function dumpFailureDiagnosticsAsync(): Promise<void> {
  await reportEndpointAsync('/auth/v1/health', false);
  await reportEndpointAsync('/storage/v1/status', false);
  await reportEndpointAsync('/storage/v1/bucket', true);
  await runDiagnosticAsync(['docker', 'logs', minioContainer, '--tail=160']);
  await runDiagnosticAsync(['kubectl', 'get', 'pods', '--namespace', namespace, '-o', 'wide']);
  await runDiagnosticAsync(['kubectl', 'get', 'pvc', '--namespace', namespace]);
  await runDiagnosticAsync([
    'kubectl',
    'get',
    'events',
    '--namespace',
    namespace,
    '--sort-by=.lastTimestamp',
  ]);
  const pods = await listPodsAllowFailureAsync();
  for (const pod of pods) {
    await runDiagnosticAsync([
      'kubectl',
      'logs',
      '--namespace',
      namespace,
      pod,
      '--all-containers',
      '--tail=160',
    ]);
  }
}

async function reportEndpointAsync(path: string, authenticated: boolean): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: authenticated
      ? { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey }
      : undefined,
  }).catch(() => undefined);
  const status = response === undefined ? 'unreachable' : String(response.status);
  process.stderr.write(`[recovery-diagnostic] GET ${path}: ${status}\n`);
}

async function listPodsAllowFailureAsync(): Promise<readonly string[]> {
  const process = Bun.spawn(
    [
      'kubectl',
      'get',
      'pods',
      '--namespace',
      namespace,
      '-o',
      'jsonpath={.items[*].metadata.name}',
    ],
    { stdout: 'pipe', stderr: 'ignore' },
  );
  const [exitCode, stdout] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
  ]);
  return exitCode === 0 ? stdout.trim().split(' ').filter((name) => name.length > 0) : [];
}

async function runDiagnosticAsync(command: readonly string[]): Promise<void> {
  const process = Bun.spawn(command, { stdout: 'inherit', stderr: 'inherit' });
  await process.exited;
}

function createDependencies(): InfraOrchestrationDependencies {
  return {
    adapterResolver: createNodeInfraAdapterPackageResolver(),
    credentials: {
      resolveAsync: ({ name }) =>
        Promise.resolve(
          name === 'SUPABASE_BOOTSTRAP'
            ? success(supabaseCredentials())
            : name === 'S3_PERSISTENCE'
              ? success({ accessKeyId: s3AccessKey, secretAccessKey: s3SecretKey })
              : failure('unexpected-credential', `Unexpected credential reference: ${name}`),
        ),
    },
    secrets: {
      resolveAsync: ({ ref, key }) =>
        Promise.resolve(failure('unexpected-secret', `Unexpected managed secret ${ref}/${key}.`)),
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

function supabaseCredentials() {
  return {
    postgresPassword: 'phase10-postgres-password',
    jwtSecret,
    anonKey: createJwt('anon'),
    serviceRoleKey,
    realtimeSecretKeyBase: 'r'.repeat(64),
    realtimeDatabaseEncryptionKey: '0123456789abcdef',
    pgMetaCryptoKey: 'phase10-meta-crypto-key-that-is-at-least-32-characters',
  } as const;
}

function createJwt(role: 'anon' | 'service_role'): string {
  const header = encodeJwtPart({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJwtPart({ role, iss: 'supabase', iat: 1_700_000_000, exp: 4_102_444_800 });
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', jwtSecret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function encodeJwtPart(value: Readonly<Record<string, string | number>>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function runAsync(command: readonly string[], label: string): Promise<string> {
  const process = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`${label} failed: ${stderr.trim()}`);
  return stdout.trim();
}

async function runAllowFailureAsync(command: readonly string[]): Promise<void> {
  const process = Bun.spawn(command, { stdout: 'ignore', stderr: 'ignore' });
  await process.exited;
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
