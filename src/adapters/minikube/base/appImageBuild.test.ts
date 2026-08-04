import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { generateInfrastructure } from '../../../index';
import { createAppManifest } from '../../../testSupport';

const APP_SLUG = 'cache-rotation';
const PUBLIC_URL = 'http://127.0.0.1:65431';
const PUBLIC_KEY_A = 'fixture-public-anon-key-a';
const PUBLIC_KEY_B = 'fixture-public-anon-key-b';
const PRIVATE_SERVICE_ROLE_KEY = 'fixture-private-service-role-key';

test('re-exports rotated public environment values before building the app image', async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'ankh-infra-app-image-'));

  try {
    const appRoot = path.join(workspaceRoot, 'apps', APP_SLUG);
    const infraRoot = path.join(appRoot, 'infra', 'minikube');
    const scriptsRoot = path.join(infraRoot, 'scripts');
    const fakeBin = path.join(workspaceRoot, 'bin');
    const buildScriptPath = path.join(scriptsRoot, 'build-app-image.sh');
    const dockerfilePath = path.join(infraRoot, 'app-image', 'Dockerfile');
    const metroCachePath = path.join(workspaceRoot, 'fake-metro-cache');
    const bunxArgsPath = path.join(workspaceRoot, 'bunx-args');
    const dockerArgsPath = path.join(workspaceRoot, 'docker-args');
    const exportDir = path.join(appRoot, '.ankh', 'web-export');
    const bundlePath = path.join(exportDir, '_expo', 'static', 'js', 'web', 'index-fixture.js');
    const generated = generateInfrastructure(
      {
        deployment: { target: 'minikube', monitoring: false },
        auth: { scope: 'global', provider: 'supabase' },
        plugins: [],
      },
      { appManifest: createAppManifest(APP_SLUG) },
    );
    const buildScript = getGeneratedFile(
      generated.files,
      'infra/minikube/scripts/build-app-image.sh',
    );

    await mkdir(path.dirname(dockerfilePath), { recursive: true });
    await mkdir(fakeBin, { recursive: true });
    await mkdir(scriptsRoot, { recursive: true });
    await writeFile(path.join(appRoot, 'package.json'), '{}\n', 'utf8');
    await writeFile(dockerfilePath, 'FROM scratch\n', 'utf8');
    await writeFile(buildScriptPath, buildScript, 'utf8');
    await chmod(buildScriptPath, 0o755);
    await writeFakeBunx(path.join(fakeBin, 'bunx'));
    await writeFakeDocker(path.join(fakeBin, 'docker'));

    await writePublicEnvironment(appRoot, infraRoot, PUBLIC_KEY_A);
    await runBuildScript({
      appRoot,
      buildScriptPath,
      bunxArgsPath,
      dockerArgsPath,
      fakeBin,
      metroCachePath,
    });

    const firstBundle = await readFile(bundlePath, 'utf8');
    expect(firstBundle).toContain(PUBLIC_KEY_A);
    expect(firstBundle).not.toContain(PRIVATE_SERVICE_ROLE_KEY);

    await writePublicEnvironment(appRoot, infraRoot, PUBLIC_KEY_B);
    await runBuildScript({
      appRoot,
      buildScriptPath,
      bunxArgsPath,
      dockerArgsPath,
      fakeBin,
      metroCachePath,
    });

    const secondBundle = await readFile(bundlePath, 'utf8');
    expect(secondBundle).toContain(PUBLIC_KEY_B);
    expect(secondBundle).not.toContain(PUBLIC_KEY_A);
    expect(secondBundle).not.toContain(PRIVATE_SERVICE_ROLE_KEY);
    expect((await readFile(bunxArgsPath, 'utf8')).trim().split('\n')).toEqual([
      'expo',
      'export',
      '--platform',
      'web',
      '--clear',
      '--output-dir',
      '.ankh/web-export',
    ]);

    const dockerArgs = (await readFile(dockerArgsPath, 'utf8')).trim().split('\n');
    expect(dockerArgs.at(-1)).toBe(exportDir);
    expect(dockerArgs).toContain(dockerfilePath);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

async function writePublicEnvironment(
  appRoot: string,
  infraRoot: string,
  publicKey: string,
): Promise<void> {
  await writeFile(
    path.join(appRoot, '.env.local'),
    `EXPO_PUBLIC_SUPABASE_URL=${PUBLIC_URL}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${publicKey}\n`,
    'utf8',
  );
  await writeFile(
    path.join(infraRoot, '.env'),
    `ANKH_APP_SLUG=${APP_SLUG}
APP_BUILD_ENABLED=true
APP_WEB_EXPORT_DIR=.ankh/web-export
APP_IMAGE=ankh/${APP_SLUG}:test
EXPO_PUBLIC_SUPABASE_URL=${PUBLIC_URL}
EXPO_PUBLIC_SUPABASE_ANON_KEY=${publicKey}
SUPABASE_SERVICE_ROLE_KEY=${PRIVATE_SERVICE_ROLE_KEY}
`,
    'utf8',
  );
}

async function writeFakeBunx(filePath: string): Promise<void> {
  await writeFile(
    filePath,
    `#!/usr/bin/env bash
set -euo pipefail

printf '%s\\n' "$@" > "\${FAKE_BUNX_ARGS_PATH:?}"

if [[ "\${1:-}" != "expo" || "\${2:-}" != "export" ]]; then
  echo "Expected expo export invocation." >&2
  exit 64
fi
shift 2

clear_cache=false
output_dir=""
platform=""
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --platform)
      platform="\${2:-}"
      shift 2
      ;;
    --clear)
      clear_cache=true
      shift
      ;;
    --output-dir)
      output_dir="\${2:-}"
      shift 2
      ;;
    *)
      echo "Unexpected expo export argument: $1" >&2
      exit 64
      ;;
  esac
done

if [[ "\${platform}" != "web" || -z "\${output_dir}" ]]; then
  echo "Expected web platform and output directory." >&2
  exit 64
fi

if [[ "\${clear_cache}" == "true" ]]; then
  : > "\${FAKE_METRO_CACHE_PATH:?}"
fi
if [[ ! -s "\${FAKE_METRO_CACHE_PATH:?}" ]]; then
  printf '%s' "\${EXPO_PUBLIC_SUPABASE_ANON_KEY:?}" > "\${FAKE_METRO_CACHE_PATH}"
fi

cached_public_key="$(<"\${FAKE_METRO_CACHE_PATH}")"
bundle_dir="\${output_dir}/_expo/static/js/web"
mkdir -p "\${bundle_dir}"
printf '<script src="/_expo/static/js/web/index-fixture.js"></script>\\n' > "\${output_dir}/index.html"
printf 'const supabaseUrl = "%s";\\nconst supabaseAnonKey = "%s";\\n' \
  "\${EXPO_PUBLIC_SUPABASE_URL:?}" \
  "\${cached_public_key}" \
  > "\${bundle_dir}/index-fixture.js"
`,
    'utf8',
  );
  await chmod(filePath, 0o755);
}

async function writeFakeDocker(filePath: string): Promise<void> {
  await writeFile(
    filePath,
    `#!/usr/bin/env bash
set -euo pipefail

printf '%s\\n' "$@" > "\${FAKE_DOCKER_ARGS_PATH:?}"
context=""
for argument in "$@"; do
  context="\${argument}"
done

if [[ ! -f "\${context}/index.html" ]]; then
  echo "Docker context does not contain the fresh web export." >&2
  exit 65
fi
`,
    'utf8',
  );
  await chmod(filePath, 0o755);
}

async function runBuildScript(args: {
  appRoot: string;
  buildScriptPath: string;
  bunxArgsPath: string;
  dockerArgsPath: string;
  fakeBin: string;
  metroCachePath: string;
}): Promise<void> {
  const child = spawn('bash', [args.buildScriptPath], {
    cwd: args.appRoot,
    env: {
      ...process.env,
      FAKE_BUNX_ARGS_PATH: args.bunxArgsPath,
      FAKE_DOCKER_ARGS_PATH: args.dockerArgsPath,
      FAKE_METRO_CACHE_PATH: args.metroCachePath,
      PATH: `${args.fakeBin}:${process.env.PATH ?? ''}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exitCodePromise = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    readStream(child.stdout),
    readStream(child.stderr),
    exitCodePromise,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `Generated build script exited with ${String(exitCode)}. stdout=${stdout} stderr=${stderr}`,
    );
  }
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  let output = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) {
    output += String(chunk);
  }
  return output;
}

function getGeneratedFile(
  files: readonly { path: string; content: string }[],
  filePath: string,
): string {
  const file = files.find((candidate) => candidate.path === filePath);
  if (!file) throw new Error(`Missing generated file: ${filePath}`);
  return file.content;
}
