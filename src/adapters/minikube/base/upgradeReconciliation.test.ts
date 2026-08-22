import { afterEach, describe, expect, test } from 'bun:test';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { generateInfrastructure } from '../../../index.js';
import { createAppManifest } from '../../../testSupport.js';

const temporaryPaths = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...temporaryPaths].map((rootPath) => fs.rm(rootPath, { force: true, recursive: true })),
  );
  temporaryPaths.clear();
});

describe('generated native-only Minikube upgrade reconciliation', () => {
  test('deletes exact stale app resources idempotently after applying desired topology', async () => {
    const profile = 'native-upgrade-reconcile';
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'infra-native-upgrade-'));
    temporaryPaths.add(rootPath);
    const generated = generateInfrastructure(
      { deployment: { target: 'minikube', monitoring: false }, modules: [] },
      {
        appManifest: {
          ...createAppManifest(profile),
          deploy: {
            targets: {
              android: { enabled: true, package: 'com.ankh.nativeupgradereconcile' },
            },
          },
        },
      },
    );

    for (const file of generated.files) {
      const filePath = path.join(rootPath, file.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content, 'utf8');
      if (file.executable === true) await fs.chmod(filePath, 0o755);
    }

    const fakeBin = path.join(rootPath, 'fake-bin');
    const kubectlLog = path.join(rootPath, 'kubectl.log');
    const resourceState = path.join(rootPath, 'app-runtime-resources');
    await fs.mkdir(fakeBin, { recursive: true });
    await fs.writeFile(
      resourceState,
      ['deployment/app-runtime', 'service/app-runtime', 'configmap/app-infra-config', ''].join(
        '\n',
      ),
      'utf8',
    );
    await writeExecutable(
      path.join(fakeBin, 'minikube'),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ " $* " == *" status "* ]]; then
  echo Running
  exit 0
fi
exit 1
`,
    );
    await writeExecutable(
      path.join(fakeBin, 'kubectl'),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "\${FAKE_KUBECTL_LOG}"
if [[ " $* " == *" apply -k "* ]]; then
  exit 0
fi
if [[ " $* " == *" delete "* ]]; then
  expected='delete deployment/app-runtime service/app-runtime configmap/app-infra-config --ignore-not-found'
  if [[ " $* " != *" \${expected} "* ]]; then
    echo "unexpected cleanup identity: $*" >&2
    exit 1
  fi
  : > "\${FAKE_RESOURCE_STATE}"
  exit 0
fi
exit 1
`,
    );

    const upScript = path.join(rootPath, 'infra/minikube/scripts/up.sh');
    const env = {
      ...process.env,
      ANKH_APP_SLUG: profile,
      FAKE_KUBECTL_LOG: kubectlLog,
      FAKE_RESOURCE_STATE: resourceState,
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
    };

    const first = await runScript(upScript, env);
    const second = await runScript(upScript, env);
    const commands = (await fs.readFile(kubectlLog, 'utf8')).trim().split('\n');
    const exactDelete = `--context ${profile} -n app delete deployment/app-runtime service/app-runtime configmap/app-infra-config --ignore-not-found`;

    expect(first.stdout).toContain(`Minikube infrastructure for '${profile}' is running.`);
    expect(second.stdout).toContain(`Minikube infrastructure for '${profile}' is running.`);
    expect(commands).toHaveLength(4);
    expect(commands[0]).toContain(`--context ${profile} apply -k `);
    expect(commands[1]).toBe(exactDelete);
    expect(commands[2]).toContain(`--context ${profile} apply -k `);
    expect(commands[3]).toBe(exactDelete);
    expect(await fs.readFile(resourceState, 'utf8')).toBe('');
  });
});

async function runScript(
  scriptPath: string,
  env: Record<string, string | undefined>,
): Promise<{ readonly stderr: string; readonly stdout: string }> {
  const process = Bun.spawn(['bash', scriptPath], {
    env,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`Generated up.sh failed (${exitCode}): ${stdout}${stderr}`);
  }
  return { stderr, stdout };
}

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf8');
  await fs.chmod(filePath, 0o755);
}
