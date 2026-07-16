import { execFile as execFileCallback } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, test } from 'bun:test';

import { generateInfrastructure } from '../../../index';
import { createAppManifest } from '../../../testSupport';
import type { GeneratedInfrastructureFile, InfraManifestInput } from '../../../types';

const execFile = promisify(execFileCallback);
const isolationTest = process.env.ANKH_MINIKUBE_ISOLATION === '1' ? test : test.skip;
const supabaseIsolationTest =
  process.env.ANKH_MINIKUBE_SUPABASE_ISOLATION === '1' ? test : test.skip;
const TEST_TIMEOUT_MS = 1_800_000;
const HTTP_TIMEOUT_MS = 60_000;

describe('generated Minikube two-app isolation', () => {
  isolationTest(
    'runs two generated app profiles without sharing cluster resources',
    async () => {
      const root = await mkdtemp(path.join(process.cwd(), '.tmp-minikube-isolation-'));
      const first = await createGeneratedApp(root, 'ankh-isolation-a', 18181);
      const second = await createGeneratedApp(root, 'ankh-isolation-b', 18182);

      try {
        await runScript(first.minikubeRoot, 'up.sh');
        await runScript(second.minikubeRoot, 'up.sh');

        await expectProfileOwnsAppNamespace(first.slug);
        await expectProfileOwnsAppNamespace(second.slug);
        await expectNoSupabaseNamespace(first.slug);
        await expectNoSupabaseNamespace(second.slug);

        const firstStatus = await runScript(first.minikubeRoot, 'status.sh');
        const secondStatus = await runScript(second.minikubeRoot, 'status.sh');
        expect(firstStatus.stdout).toContain('- namespace/app: present');
        expect(secondStatus.stdout).toContain('- namespace/app: present');
        expect(firstStatus.stdout).toContain('app: running');
        expect(secondStatus.stdout).toContain('app: running');
      } finally {
        await Promise.allSettled([
          runScript(first.minikubeRoot, 'destroy.sh'),
          runScript(second.minikubeRoot, 'destroy.sh'),
          removeDockerImage(first.dockerImage),
          removeDockerImage(second.dockerImage),
        ]);
        await rm(root, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT_MS,
  );

  supabaseIsolationTest(
    'runs two generated Supabase-backed profiles without shared runtime state',
    async () => {
      const root = await mkdtemp(path.join(process.cwd(), '.tmp-minikube-supabase-isolation-'));
      const first = await createGeneratedSupabaseApp(root, 'ankh-isolation-supa-a', 18281);
      const second = await createGeneratedSupabaseApp(root, 'ankh-isolation-supa-b', 18282);

      try {
        await runScript(first.minikubeRoot, 'up.sh');
        await runScript(second.minikubeRoot, 'up.sh');

        await expectProfileOwnsAppNamespace(first.slug);
        await expectProfileOwnsAppNamespace(second.slug);
        await expectSupabaseRuntime(first.slug);
        await expectSupabaseRuntime(second.slug);
        await expectNoHostSupabaseComposeContainersFor(first.slug, second.slug);

        await expectSupabaseEndToEnd(first);
        const secondSession = await expectSupabaseEndToEnd(second);

        await runScript(second.minikubeRoot, 'down.sh');
        await runScript(second.minikubeRoot, 'up.sh');
        await expectSupabaseSessionPersists(second, secondSession);

        await runScript(first.minikubeRoot, 'destroy.sh');
        await expectSupabaseEndToEnd(second);
      } finally {
        await Promise.allSettled([
          runScript(first.minikubeRoot, 'destroy.sh'),
          runScript(second.minikubeRoot, 'destroy.sh'),
          removeDockerImage(first.dockerImage),
          removeDockerImage(second.dockerImage),
        ]);
        await rm(root, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT_MS,
  );
});

async function createGeneratedApp(root: string, slug: string, appPort: number) {
  const appRoot = path.join(root, slug);
  const minikubeRoot = path.join(appRoot, 'infra', 'minikube');
  const exportRoot = path.join(appRoot, '.ankh', 'web-export');
  const dockerImage = `ankh/${slug}:isolation`;
  await mkdir(appRoot, { recursive: true });
  await writeGeneratedFiles(appRoot, generateAppOnlyInfrastructure(slug).files);
  await mkdir(exportRoot, { recursive: true });
  await writeFile(path.join(exportRoot, 'index.html'), `<h1>${slug}</h1>\n`);
  await execFile(
    'docker',
    [
      'build',
      '-t',
      dockerImage,
      '-f',
      path.join(minikubeRoot, 'app-image', 'Dockerfile'),
      exportRoot,
    ],
    { timeout: 180_000 },
  );
  await writeFile(
    path.join(minikubeRoot, '.env'),
    [
      `ANKH_APP_SLUG=${slug}`,
      `APP_IMAGE=${dockerImage}`,
      'APP_BUILD_ENABLED=false',
      'APP_WEB_EXPORT_DIR=.ankh/web-export',
      'APP_IMAGE_SYNC_STRATEGY=docker-load',
      `APP_PORT_FORWARD_LOCAL_PORT=${appPort}`,
      '',
    ].join('\n'),
  );

  return { appRoot, dockerImage, minikubeRoot, slug };
}

function generateAppOnlyInfrastructure(slug: string) {
  const manifest: InfraManifestInput = {
    deployment: {
      target: 'minikube',
      monitoring: false,
    },
    plugins: [],
  };

  return generateInfrastructure(manifest, {
    appManifest: createAppManifest(slug),
  });
}

async function createGeneratedSupabaseApp(root: string, slug: string, appPort: number) {
  const appRoot = path.join(root, slug);
  const minikubeRoot = path.join(appRoot, 'infra', 'minikube');
  const exportRoot = path.join(appRoot, '.ankh', 'web-export');
  const dockerImage = `ankh/${slug}:isolation`;
  await mkdir(appRoot, { recursive: true });
  await writeGeneratedFiles(appRoot, generateSupabaseInfrastructure(slug).files);
  await mkdir(exportRoot, { recursive: true });
  await writeFile(path.join(exportRoot, 'index.html'), `<h1>${slug}</h1>\n`);
  await execFile(
    'docker',
    [
      'build',
      '-t',
      dockerImage,
      '-f',
      path.join(minikubeRoot, 'app-image', 'Dockerfile'),
      exportRoot,
    ],
    { timeout: 180_000 },
  );
  await writeFile(
    path.join(minikubeRoot, '.env'),
    [
      `ANKH_APP_SLUG=${slug}`,
      `APP_IMAGE=${dockerImage}`,
      'APP_BUILD_ENABLED=false',
      'APP_WEB_EXPORT_DIR=.ankh/web-export',
      'APP_IMAGE_SYNC_STRATEGY=docker-load',
      `APP_PORT_FORWARD_LOCAL_PORT=${appPort}`,
      '',
    ].join('\n'),
  );

  return { appRoot, dockerImage, minikubeRoot, slug };
}

function generateSupabaseInfrastructure(slug: string) {
  const manifest: InfraManifestInput = {
    deployment: {
      target: 'minikube',
      monitoring: false,
    },
    auth: {
      scope: 'global',
      provider: 'supabase',
      profile: {
        table: 'profiles',
        fields: ['email'],
      },
    },
    database: {
      provider: 'supabase',
      tier: 'dev',
    },
    storage: {
      provider: 'supabase',
      buckets: ['avatars'],
    },
    secretStore: {
      provider: 'supabase-vault',
    },
    plugins: [],
  };

  return generateInfrastructure(manifest, {
    appManifest: createAppManifest(slug),
  });
}

async function writeGeneratedFiles(
  appRoot: string,
  files: readonly GeneratedInfrastructureFile[],
): Promise<void> {
  await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(appRoot, file.path);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, 'utf8');
      if (file.executable === true) {
        await chmod(filePath, 0o755);
      }
    }),
  );
}

async function runScript(minikubeRoot: string, scriptName: string) {
  return execFile(path.join(minikubeRoot, 'scripts', scriptName), {
    cwd: minikubeRoot,
    env: process.env,
    timeout: TEST_TIMEOUT_MS,
  });
}

async function removeDockerImage(image: string): Promise<void> {
  await execFile('docker', ['image', 'rm', image], { timeout: 60_000 }).catch(() => {
    // Best-effort cleanup for gated local integration runs.
  });
}

async function expectProfileOwnsAppNamespace(profile: string) {
  const result = await execFile(
    'kubectl',
    ['--context', profile, '-n', 'app', 'get', 'deployment', 'app-runtime', '-o', 'name'],
    { timeout: 60_000 },
  );
  expect(result.stdout.trim()).toBe('deployment.apps/app-runtime');
}

async function expectNoSupabaseNamespace(profile: string) {
  let namespaceFound = true;
  try {
    await execFile('kubectl', ['--context', profile, 'get', 'namespace', 'supabase'], {
      timeout: 60_000,
    });
  } catch {
    namespaceFound = false;
  }
  expect(namespaceFound).toBe(false);
}

async function expectSupabaseRuntime(profile: string) {
  const namespace = await execFile(
    'kubectl',
    ['--context', profile, 'get', 'namespace', 'supabase', '-o', 'name'],
    { timeout: 60_000 },
  );
  expect(namespace.stdout.trim()).toBe('namespace/supabase');

  for (const deployment of ['postgres', 'auth', 'rest', 'realtime', 'storage', 'gateway']) {
    const result = await execFile(
      'kubectl',
      ['--context', profile, '-n', 'supabase', 'get', 'deployment', deployment, '-o', 'name'],
      { timeout: 60_000 },
    );
    expect(result.stdout.trim()).toBe(`deployment.apps/${deployment}`);
  }
}

async function expectNoHostSupabaseComposeContainersFor(...slugs: string[]) {
  const result = await execFile('docker', ['ps', '--format', '{{.Names}}'], { timeout: 60_000 });
  const names = result.stdout
    .split(/\r?\n/u)
    .map((name) => name.trim())
    .filter(Boolean);

  for (const slug of slugs) {
    expect(names.some((name) => name.startsWith('supabase_') && name.includes(slug))).toBe(false);
  }
}

interface SupabaseSessionFixture {
  readonly accessToken: string;
  readonly anonKey: string;
  readonly email: string;
  readonly gatewayUrl: string;
  readonly userId: string;
}

async function expectSupabaseEndToEnd(app: {
  minikubeRoot: string;
  slug: string;
}): Promise<SupabaseSessionFixture> {
  const env = await readGeneratedEnv(app.minikubeRoot);
  const gatewayUrl = readRequiredEnv(env, 'SUPABASE_PUBLIC_URL');
  const anonKey = readRequiredEnv(env, 'SUPABASE_ANON_KEY');
  const serviceRoleKey = readRequiredEnv(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const dbUrl = readRequiredEnv(env, 'SUPABASE_DB_URL');
  const email = `${app.slug}-${Date.now()}@example.test`;
  const password = `pw-${app.slug}-1234567890`;

  const signup = await postJson(`${gatewayUrl}/auth/v1/signup`, anonKey, anonKey, {
    email,
    password,
  });
  assertHttpOk(signup, 'auth signup');

  const signIn = await postJson(
    `${gatewayUrl}/auth/v1/token?grant_type=password`,
    anonKey,
    anonKey,
    {
      email,
      password,
    },
  );
  assertHttpOk(signIn, 'auth password sign-in');
  const accessToken = readStringField(signIn.body, 'access_token');
  const userId = readStringField(readRecord(signIn.body, 'user'), 'id');

  const profile = await getJson(
    `${gatewayUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email`,
    anonKey,
    accessToken,
  );
  assertHttpOk(profile, 'profile REST read');
  expect(Array.isArray(profile.body)).toBe(true);
  expect(profile.body).toHaveLength(1);
  expect(profile.body[0]).toMatchObject({ id: userId, email });

  await ensureStorageObjectRoundTrip(gatewayUrl, serviceRoleKey, app.slug);
  await ensureVaultRoundTrip(dbUrl, app.slug);

  return { accessToken, anonKey, email, gatewayUrl, userId };
}

async function expectSupabaseSessionPersists(
  app: { minikubeRoot: string; slug: string },
  session: SupabaseSessionFixture,
): Promise<void> {
  const env = await readGeneratedEnv(app.minikubeRoot);
  const gatewayUrl = readRequiredEnv(env, 'SUPABASE_PUBLIC_URL');
  const anonKey = readRequiredEnv(env, 'SUPABASE_ANON_KEY');
  expect(gatewayUrl).toBe(session.gatewayUrl);
  expect(anonKey).toBe(session.anonKey);

  const user = await getJson(`${gatewayUrl}/auth/v1/user`, anonKey, session.accessToken);
  assertHttpOk(user, 'auth user read after stop/start');
  expect(user.body).toMatchObject({ id: session.userId, email: session.email });

  const profile = await getJson(
    `${gatewayUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(session.userId)}&select=id,email`,
    anonKey,
    session.accessToken,
  );
  assertHttpOk(profile, 'profile REST read after stop/start');
  expect(Array.isArray(profile.body)).toBe(true);
  expect(profile.body).toHaveLength(1);
  expect(profile.body[0]).toMatchObject({ id: session.userId, email: session.email });
}

async function readGeneratedEnv(minikubeRoot: string): Promise<Map<string, string>> {
  const content = await readFile(path.join(minikubeRoot, '.env'), 'utf8');
  const env = new Map<string, string>();
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    env.set(trimmed.slice(0, separator), trimmed.slice(separator + 1));
  }
  return env;
}

function readRequiredEnv(env: Map<string, string>, key: string): string {
  const value = env.get(key);
  if (!value) throw new Error(`Missing generated env value ${key}.`);
  return value;
}

async function postJson(
  url: string,
  apikey: string,
  bearer: string,
  body: Record<string, unknown>,
): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers: {
      apikey,
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json().catch(() => null) };
}

async function getJson(
  url: string,
  apikey: string,
  bearer: string,
): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers: {
      apikey,
      authorization: `Bearer ${bearer}`,
    },
  });
  return { response, body: await response.json().catch(() => null) };
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected object while reading ${field}.`);
  }
  const child = (value as Record<string, unknown>)[field];
  if (!child || typeof child !== 'object' || Array.isArray(child)) {
    throw new Error(`Expected object field ${field}.`);
  }
  return child as Record<string, unknown>;
}

function readStringField(value: unknown, field: string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected object while reading ${field}.`);
  }
  const fieldValue = (value as Record<string, unknown>)[field];
  if (typeof fieldValue !== 'string' || fieldValue.length === 0) {
    throw new Error(`Expected non-empty string field ${field}.`);
  }
  return fieldValue;
}

async function ensureStorageObjectRoundTrip(
  gatewayUrl: string,
  serviceRoleKey: string,
  slug: string,
): Promise<void> {
  const bucket = await postJson(`${gatewayUrl}/storage/v1/bucket`, serviceRoleKey, serviceRoleKey, {
    id: 'avatars',
    name: 'avatars',
    public: false,
  });
  if (!bucket.response.ok && bucket.response.status !== 409 && !isStorageDuplicate(bucket.body)) {
    throw new Error(
      `storage bucket create failed with HTTP ${bucket.response.status}: ${JSON.stringify(
        bucket.body,
      )}`,
    );
  }

  const objectKey = `e2e/${slug}-${Date.now()}.txt`;
  const upload = await fetch(`${gatewayUrl}/storage/v1/object/avatars/${objectKey}`, {
    method: 'POST',
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'text/plain',
      'x-upsert': 'true',
    },
    body: `storage:${slug}`,
  });
  if (!upload.ok) {
    throw new Error(`storage upload failed with HTTP ${upload.status}: ${await upload.text()}`);
  }

  const download = await fetch(`${gatewayUrl}/storage/v1/object/avatars/${objectKey}`, {
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!download.ok) {
    throw new Error(
      `storage download failed with HTTP ${download.status}: ${await download.text()}`,
    );
  }
  expect(await download.text()).toBe(`storage:${slug}`);
}

function assertHttpOk(result: { response: Response; body: unknown }, label: string): void {
  if (result.response.ok) return;
  throw new Error(
    `${label} failed with HTTP ${result.response.status}: ${JSON.stringify(result.body)}`,
  );
}

function isStorageDuplicate(body: unknown): boolean {
  return (
    !!body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    (body as Record<string, unknown>).statusCode === '409'
  );
}

async function ensureVaultRoundTrip(dbUrl: string, slug: string): Promise<void> {
  const secretRef = `e2e/${slug}/${Date.now()}`;
  const marker = `vault:${slug}`;
  const sql = `
with created as (
  select vault.create_secret('${escapeSqlLiteral(JSON.stringify({ marker }))}', '${escapeSqlLiteral(
    secretRef,
  )}', 'Generated Supabase isolation test')::uuid as id
)
insert into ankh_secret_store.secret_metadata (
  project_id, environment, secret_ref, vault_secret_id, kind, provider, configured_fields
)
select '${escapeSqlLiteral(slug)}', 'local', '${escapeSqlLiteral(
    secretRef,
  )}', id, 'generic', 'e2e', array['marker']::text[]
from created;
`;
  await execFile('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], {
    timeout: 60_000,
  });

  const resolved = await execFile(
    'psql',
    [
      dbUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '-Atq',
      '-c',
      `select decrypted.decrypted_secret::jsonb ->> 'marker'
       from ankh_secret_store.secret_metadata metadata
       join vault.decrypted_secrets decrypted on decrypted.id = metadata.vault_secret_id
       where metadata.project_id = '${escapeSqlLiteral(slug)}'
         and metadata.environment = 'local'
         and metadata.secret_ref = '${escapeSqlLiteral(secretRef)}'
       limit 1;`,
    ],
    { timeout: 60_000 },
  );
  expect(resolved.stdout.trim()).toBe(marker);
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/gu, "''");
}
