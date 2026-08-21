import { afterEach, describe, expect, test } from 'bun:test';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { generateInfrastructure } from '../../../index.js';
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

      const recovery = await runPortForward(fixture, 'start', 'runtime');
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
});

interface PortForwardFixture {
  readonly env: Record<string, string>;
  readonly processDirectory: string;
  readonly profile: string;
  readonly rootPath: string;
  readonly scriptPath: string;
}

async function createPortForwardFixture(
  manifest: InfraManifestInput,
  profile: string,
): Promise<PortForwardFixture> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-port-forward-runtime-'));
  temporaryPaths.add(rootPath);
  const generated = generateInfrastructure(manifest, {
    appManifest: createAppManifest(profile),
  });
  const generatedScript = generated.files.find(
    (file) => file.path === 'infra/minikube/scripts/port-forward.sh',
  );
  if (generatedScript === undefined) {
    throw new Error('Generated port-forward script was missing.');
  }

  const scriptPath = path.join(rootPath, generatedScript.path);
  const fakeBin = path.join(rootPath, 'fake-bin');
  const processDirectory = path.join(rootPath, 'fake-processes');
  const serverScript = path.join(rootPath, 'forward-server.ts');
  await fs.mkdir(path.dirname(scriptPath), { recursive: true });
  await fs.mkdir(fakeBin, { recursive: true });
  await fs.mkdir(processDirectory, { recursive: true });
  await fs.writeFile(scriptPath, generatedScript.content, 'utf8');
  await fs.chmod(scriptPath, 0o755);
  await fs.writeFile(
    serverScript,
    [
      "const port = Number.parseInt(Bun.argv[2] ?? '', 10);",
      "Bun.serve({ hostname: '127.0.0.1', port, fetch: () => new Response('ok') });",
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
  exit 0
fi
if [[ " $* " != *" port-forward "* ]]; then
  exit 1
fi
endpoint="\${!#}"
local_port="\${endpoint%%:*}"
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
  return {
    env: {
      ...process.env,
      ANKH_APP_SLUG: profile,
      APP_PORT_FORWARD_LOCAL_PORT: String(ports[0]),
      SUPABASE_GATEWAY_FORWARD_LOCAL_PORT: String(ports[1]),
      SUPABASE_STUDIO_FORWARD_LOCAL_PORT: String(ports[2]),
      SUPABASE_DB_FORWARD_LOCAL_PORT: String(ports[3]),
      FAKE_FORWARD_SERVER_SCRIPT: serverScript,
      FAKE_PROCESS_DIRECTORY: processDirectory,
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
    },
    processDirectory,
    profile,
    rootPath,
    scriptPath,
  };
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
