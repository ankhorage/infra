import { execFile as execFileCallback } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, test } from 'bun:test';

import { generateInfrastructure } from '../../../index';
import { createAppManifest } from '../../../testSupport';
import type { GeneratedInfrastructureFile, InfraManifestInput } from '../../../types';

const execFile = promisify(execFileCallback);
const isolationTest = process.env.ANKH_MINIKUBE_ISOLATION === '1' ? test : test.skip;
const TEST_TIMEOUT_MS = 900_000;

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
