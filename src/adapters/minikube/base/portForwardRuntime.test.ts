import { afterEach, describe, expect, test } from 'bun:test';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { generateInfrastructure } from '../../../index.js';
import { ensureProjectInfrastructureRuntime } from '../../../project/index.js';
import { createAppManifest } from '../../../testSupport.js';
import type { InfraManifestInput } from '../../../types.js';

const temporaryPaths = new Set<string>();

afterEach(async () => {
  for (const rootPath of temporaryPaths) {
    await stopFixtureProcesses(rootPath);
    await fs.rm(rootPath, { force: true, recursive: true });
  }
  temporaryPaths.clear();
});

describe('generated Minikube runtime port-forward lifecycle', () => {
  test(
    'keeps healthy app forwarding, repairs a stopped Supabase gateway, and isolates operational forwards',
    async () => {
      const fixture = await createPortForwardFixture(createSupabaseManifest(), 'runtime-recovery');

      const firstStart = await runPortForward(fixture, 'start', 'runtime');
      expect(firstStart.stdout).toContain('app: started');
      expect(firstStart.stdout).toContain('supabase-gateway: started');

      const appPid = await readForwardPid(fixture, 'app');
      const firstGatewayPid = await readForwardPid(fixture, 'supabase-gateway');
      await expectForwardPid(fixture, 'studio', false);
      await expectForwardPid(fixture, 'db-migration', false);

      const repeatedStart = await runPortForward(fixture, 'start', 'runtime');
      expect(repeatedStart.stdout).toContain(`app: running (pid ${appPid})`);
      expect(repeatedStart.stdout).toContain(`supabase-gateway: running (pid ${firstGatewayPid})`);
      expect(await readForwardPid(fixture, 'app')).toBe(appPid);
      expect(await readForwardPid(fixture, 'supabase-gateway')).toBe(firstGatewayPid);

      await runPortForward(fixture, 'stop', 'supabase-gateway');
      expect(await readForwardPid(fixture, 'app')).toBe(appPid);
      await expectForwardPid(fixture, 'supabase-gateway', false);

      const recovery = await ensureProjectInfrastructureRuntime({
        projectId: fixture.profile,
        projectPath: fixture.rootPath,
        target: 'minikube',
      });
      expect(recovery.stdout).toContain(`app: running (pid ${appPid})`);
      expect(recovery.stdout).toContain('supabase-gateway: started');
      expect(await readForwardPid(fixture, 'app')).toBe(appPid);
      expect(await readForwardPid(fixture, 'supabase-gateway')).not.toBe(firstGatewayPid);
      await expectForwardPid(fixture, 'studio', false);
      await expectForwardPid(fixture, 'db-migration', false);

      await runPortForward(fixture, 'stop', 'runtime');
    },
    { timeout: 30_000 },
  );

  test(
    'starts only the app forward when no provider owns another runtime endpoint',
    async () => {
      const fixture = await createPortForwardFixture(
        { deployment: { target: 'minikube', monitoring: false }, modules: [] },
        'runtime-app-only',
      );

      const result = await runPortForward(fixture, 'start', 'runtime');

      expect(result.stdout).toContain('app: started');
      expect(result.stdout).not.toContain('supabase-gateway');
      await expectForwardPid(fixture, 'app', true);
      await expectForwardPid(fixture, 'supabase-gateway', false);
      await expectForwardPid(fixture, 'studio', false);
      await expectForwardPid(fixture, 'db-migration', false);

      await runPortForward(fixture, 'stop', 'runtime');
    },
    { timeout: 15_000 },
  );

  test(
    'restores only the Supabase gateway for a native-only app without an app service',
    async () => {
      const appManifest = {
        ...createAppManifest('native-runtime'),
        deploy: {
          targets: {
            android: { enabled: true, package: 'com.ankh.nativeruntime' },
          },
        },
      };
      const fixture = await createPortForwardFixture(
        createSupabaseManifest(),
        'native-runtime',
        appManifest,
        'service/app-runtime',
      );

      const firstEnsure = await ensureProjectInfrastructureRuntime({
        projectId: fixture.profile,
        projectPath: fixture.rootPath,
        target: 'minikube',
      });
      expect(firstEnsure.stdout).toContain('supabase-gateway: started');
      expect(firstEnsure.stdout).not.toContain('app:');
      const gatewayPid = await readForwardPid(fixture, 'supabase-gateway');

      const repeatedEnsure = await ensureProjectInfrastructureRuntime({
        projectId: fixture.profile,
        projectPath: fixture.rootPath,
        target: 'minikube',
      });
      expect(repeatedEnsure.stdout).toContain(`supabase-gateway: running (pid ${gatewayPid})`);
      expect(await readForwardPid(fixture, 'supabase-gateway')).toBe(gatewayPid);
      await expectForwardPid(fixture, 'app', false);
    },
    { timeout: 15_000 },
  );

  test(
    'retries a transient forward that becomes reachable and then loses its stale pod',
    async () => {
      const appManifest = {
        ...createAppManifest('native-runtime-retry'),
        deploy: {
          targets: {
            android: { enabled: true, package: 'com.ankh.nativeruntimeretry' },
          },
        },
      };
      const fixture = await createPortForwardFixture(
        createSupabaseManifest(),
        'native-runtime-retry',
        appManifest,
        undefined,
        1,
        750,
      );

      const recovery = await ensureProjectInfrastructureRuntime({
        projectId: fixture.profile,
        projectPath: fixture.rootPath,
        target: 'minikube',
      });

      expect(recovery.stdout).toContain(
        'supabase-gateway: port-forward attempt 1 exited before readiness; retrying',
      );
      expect(recovery.stdout).toContain('supabase-gateway: started');
      expect(Number.parseInt(await fs.readFile(fixture.forwardAttemptPath, 'utf8'), 10)).toBe(2);
      await expectForwardPid(fixture, 'supabase-gateway', true);
      await expectForwardPid(fixture, 'app', false);
    },
    { timeout: 15_000 },
  );

  test('fails actionably when a generated Web app target is genuinely missing', async () => {
    const fixture = await createPortForwardFixture(
      createSupabaseManifest(),
      'missing-web-runtime',
      createAppManifest('missing-web-runtime'),
      'service/app-runtime',
    );

    await expectFailureMessage(
      ensureProjectInfrastructureRuntime({
        projectId: fixture.profile,
        projectPath: fixture.rootPath,
        target: 'minikube',
      }),
      'app: target app/service/app-runtime not found',
    );
    await expectForwardPid(fixture, 'supabase-gateway', false);
  });

  test('fails actionably when a generated provider target is genuinely missing', async () => {
    const appManifest = {
      ...createAppManifest('missing-provider-runtime'),
      deploy: {
        targets: {
          android: { enabled: true, package: 'com.ankh.missingprovider' },
        },
      },
    };
    const fixture = await createPortForwardFixture(
      createSupabaseManifest(),
      'missing-provider-runtime',
      appManifest,
      'service/gateway',
    );

    await expectFailureMessage(
      ensureProjectInfrastructureRuntime({
        projectId: fixture.profile,
        projectPath: fixture.rootPath,
        target: 'minikube',
      }),
      'supabase-gateway: target supabase/service/gateway not found',
    );
  });
});

interface PortForwardFixture {
  readonly env: Record<string, string>;
  readonly forwardAttemptPath: string;
  readonly processDirectory: string;
  readonly profile: string;
  readonly rootPath: string;
  readonly scriptPath: string;
}

async function createPortForwardFixture(
  manifest: InfraManifestInput,
  profile: string,
  appManifest = createAppManifest(profile),
  missingResource?: string,
  transientPortForwardFailures = 0,
  transientPortForwardLifetimeMs = 0,
): Promise<PortForwardFixture> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-port-forward-runtime-'));
  temporaryPaths.add(rootPath);
  const generated = generateInfrastructure(manifest, {
    appManifest,
  });
  const generatedScript = generated.files.find(
    (file) => file.path === 'infra/minikube/scripts/port-forward.sh',
  );
  if (generatedScript === undefined) {
    throw new Error('Generated port-forward script was missing.');
  }

  const scriptPath = path.join(rootPath, generatedScript.path);
  const fakeBin = path.join(rootPath, 'fake-bin');
  const forwardAttemptPath = path.join(rootPath, 'forward-attempts');
  const processDirectory = path.join(rootPath, 'fake-processes');
  const serverScript = path.join(rootPath, 'forward-server.ts');
  await fs.mkdir(path.dirname(scriptPath), { recursive: true });
  await fs.mkdir(fakeBin, { recursive: true });
  await fs.mkdir(processDirectory, { recursive: true });
  await fs.writeFile(
    serverScript,
    [
      "const port = Number.parseInt(Bun.argv[2] ?? '', 10);",
      "const lifetimeMs = Number.parseInt(Bun.argv[3] ?? '0', 10);",
      "const server = Bun.serve({ hostname: '127.0.0.1', port, fetch: () => new Response('ok') });",
      'if (lifetimeMs > 0) {',
      '  await Bun.sleep(lifetimeMs);',
      '  server.stop(true);',
      '  process.exit(1);',
      '}',
      'await new Promise(() => undefined);',
      '',
    ].join('\n'),
    'utf8',
  );
  await writeExecutable(
    path.join(fakeBin, 'kubectl'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ " $* " == *" get "* ]]; then
  if [[ -n "\${FAKE_MISSING_RESOURCE:-}" && " $* " == *" \${FAKE_MISSING_RESOURCE} "* ]]; then
    exit 1
  fi
  exit 0
fi
if [[ " $* " != *" port-forward "* ]]; then
  exit 1
fi
endpoint="\${!#}"
local_port="\${endpoint%%:*}"
forward_attempt=0
if [[ -f "\${FAKE_FORWARD_ATTEMPT_FILE}" ]]; then
  forward_attempt="$(cat "\${FAKE_FORWARD_ATTEMPT_FILE}")"
fi
forward_attempt="$((forward_attempt + 1))"
printf '%s\n' "\${forward_attempt}" > "\${FAKE_FORWARD_ATTEMPT_FILE}"
if [[ "\${forward_attempt}" -le "\${FAKE_TRANSIENT_FORWARD_FAILURES}" ]]; then
  if [[ "\${FAKE_TRANSIENT_FORWARD_LIFETIME_MS}" -gt 0 ]]; then
    bun "\${FAKE_FORWARD_SERVER_SCRIPT}" "\${local_port}" "\${FAKE_TRANSIENT_FORWARD_LIFETIME_MS}" || true
  fi
  echo 'error: error upgrading connection: unable to upgrade connection: pod does not exist' >&2
  exit 1
fi
printf 'kubectl %s\n' "$*" > "\${FAKE_PROCESS_DIRECTORY}/$$.command"
exec bun "\${FAKE_FORWARD_SERVER_SCRIPT}" "\${local_port}"
`,
  );
  await writeExecutable(
    path.join(fakeBin, 'ps'),
    `#!/usr/bin/env bash
set -euo pipefail
pid=""
format=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -p) pid="$2"; shift 2 ;;
    -o) format="$2"; shift 2 ;;
    *) shift ;;
  esac
done
command_file="\${FAKE_PROCESS_DIRECTORY}/\${pid}.command"
if [[ -f "\${command_file}" && "\${format}" == "comm=" ]]; then
  echo kubectl
elif [[ -f "\${command_file}" && "\${format}" == "command=" ]]; then
  cat "\${command_file}"
else
  /bin/ps -p "\${pid}" -o "\${format}"
fi
`,
  );

  const ports = reserveAvailablePorts(4);
  const env = {
    ...process.env,
    ANKH_APP_SLUG: profile,
    APP_PORT_FORWARD_LOCAL_PORT: String(ports[0]),
    SUPABASE_GATEWAY_FORWARD_LOCAL_PORT: String(ports[1]),
    SUPABASE_STUDIO_FORWARD_LOCAL_PORT: String(ports[2]),
    SUPABASE_DB_FORWARD_LOCAL_PORT: String(ports[3]),
    FAKE_FORWARD_ATTEMPT_FILE: forwardAttemptPath,
    FAKE_FORWARD_SERVER_SCRIPT: serverScript,
    FAKE_PROCESS_DIRECTORY: processDirectory,
    FAKE_TRANSIENT_FORWARD_FAILURES: String(transientPortForwardFailures),
    FAKE_TRANSIENT_FORWARD_LIFETIME_MS: String(transientPortForwardLifetimeMs),
    ...(missingResource ? { FAKE_MISSING_RESOURCE: missingResource } : {}),
    PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
  };
  const injectedEnvironment = Object.entries(env)
    .filter(([key]) =>
      [
        'ANKH_APP_SLUG',
        'APP_PORT_FORWARD_LOCAL_PORT',
        'SUPABASE_GATEWAY_FORWARD_LOCAL_PORT',
        'SUPABASE_STUDIO_FORWARD_LOCAL_PORT',
        'SUPABASE_DB_FORWARD_LOCAL_PORT',
        'FAKE_FORWARD_ATTEMPT_FILE',
        'FAKE_FORWARD_SERVER_SCRIPT',
        'FAKE_PROCESS_DIRECTORY',
        'FAKE_TRANSIENT_FORWARD_FAILURES',
        'FAKE_TRANSIENT_FORWARD_LIFETIME_MS',
        'FAKE_MISSING_RESOURCE',
        'PATH',
      ].includes(key),
    )
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join('\n');
  await fs.writeFile(
    scriptPath,
    generatedScript.content.replace(
      '#!/usr/bin/env bash\n',
      `#!/usr/bin/env bash\n${injectedEnvironment}\n`,
    ),
    'utf8',
  );
  await fs.chmod(scriptPath, 0o755);
  return {
    env,
    forwardAttemptPath,
    processDirectory,
    profile,
    rootPath,
    scriptPath,
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function expectFailureMessage(promise: Promise<unknown>, expected: string): Promise<void> {
  try {
    await promise;
    throw new Error('Expected runtime ensure to fail.');
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain(expected);
  }
}

async function runPortForward(
  fixture: PortForwardFixture,
  action: string,
  name: string,
): Promise<{ readonly exitCode: number; readonly stderr: string; readonly stdout: string }> {
  const process = Bun.spawn(['bash', fixture.scriptPath, action, name], {
    env: fixture.env,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`port-forward ${action} ${name} failed (${exitCode}): ${stdout}${stderr}`);
  }
  return { exitCode, stderr, stdout };
}

async function readForwardPid(fixture: PortForwardFixture, name: string): Promise<number> {
  const value = await fs.readFile(forwardPidPath(fixture, name), 'utf8');
  return Number.parseInt(value.trim(), 10);
}

async function expectForwardPid(
  fixture: PortForwardFixture,
  name: string,
  exists: boolean,
): Promise<void> {
  expect(await pathExists(forwardPidPath(fixture, name))).toBe(exists);
}

function forwardPidPath(fixture: PortForwardFixture, name: string): string {
  return path.join(
    fixture.rootPath,
    'infra/minikube/.state/forwards',
    `${fixture.profile}-${name}.pid`,
  );
}

function reserveAvailablePorts(count: number): number[] {
  const listeners = Array.from({ length: count }, () =>
    Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      socket: { data: () => undefined },
    }),
  );
  const ports = listeners.map((listener) => listener.port);
  listeners.forEach((listener) => listener.stop(true));
  return ports;
}

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf8');
  await fs.chmod(filePath, 0o755);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function stopFixtureProcesses(rootPath: string): Promise<void> {
  const stateDirectory = path.join(rootPath, 'infra/minikube/.state/forwards');
  let entries: string[];
  try {
    entries = await fs.readdir(stateDirectory);
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.pid'))
      .map(async (entry) => {
        const pid = Number.parseInt(
          await fs.readFile(path.join(stateDirectory, entry), 'utf8'),
          10,
        );
        if (Number.isInteger(pid)) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // The generated lifecycle may already have stopped the process.
          }
        }
      }),
  );
}

function createSupabaseManifest(): InfraManifestInput {
  return {
    deployment: { target: 'minikube', monitoring: false },
    auth: { scope: 'global', provider: 'supabase' },
    database: { provider: 'supabase', tier: 'dev' },
    modules: [],
  };
}
