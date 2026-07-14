import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { InfraManifestInput } from '../../../types';
import { generateMinikubeBaseArtifacts } from './index';

describe('generateMinikubeBaseArtifacts Supabase local ports', () => {
  test('keeps legacy my-app defaults while allocating a different range for another app', () => {
    const myAppEnv = getGeneratedFileContent('my-app', 'infra/minikube/.env.example');
    const chessEnv = getGeneratedFileContent('chess', 'infra/minikube/.env.example');

    expect(myAppEnv).toContain('SUPABASE_LOCAL_PORT_BASE=55320');
    expect(myAppEnv).toContain('SUPABASE_LOCAL_SHADOW_PORT=55320');
    expect(myAppEnv).toContain('SUPABASE_LOCAL_API_PORT=55321');
    expect(myAppEnv).toContain('SUPABASE_LOCAL_DB_PORT=55322');
    expect(myAppEnv).toContain('SUPABASE_LOCAL_STUDIO_PORT=55323');
    expect(myAppEnv).toContain('SUPABASE_LOCAL_INBUCKET_PORT=55324');
    expect(myAppEnv).toContain('SUPABASE_LOCAL_ANALYTICS_PORT=55325');

    expect(chessEnv).toContain('SUPABASE_LOCAL_PORT_BASE=62200');
    expect(chessEnv).toContain('SUPABASE_LOCAL_SHADOW_PORT=62200');
    expect(chessEnv).toContain('SUPABASE_LOCAL_API_PORT=62201');
    expect(chessEnv).toContain('SUPABASE_LOCAL_DB_PORT=62202');
    expect(chessEnv).toContain('SUPABASE_LOCAL_STUDIO_PORT=62203');
    expect(chessEnv).toContain('SUPABASE_LOCAL_INBUCKET_PORT=62204');
    expect(chessEnv).toContain('SUPABASE_LOCAL_ANALYTICS_PORT=62205');
    expect(chessEnv).not.toContain('SUPABASE_LOCAL_DB_PORT=55322');
  });

  test('generates bootstrap logic that derives ports from the app port base and preflights collisions', () => {
    const script = getGeneratedFileContent('chess', 'infra/minikube/scripts/supabase-local-env.sh');

    expect(script).toContain('SUPABASE_LOCAL_PORT_BASE="${SUPABASE_LOCAL_PORT_BASE:-62200}"');
    expect(script).toContain(
      'SUPABASE_LOCAL_DB_PORT="${SUPABASE_LOCAL_DB_PORT:-$((SUPABASE_LOCAL_PORT_BASE + 2))}"',
    );
    expect(script).toContain('assert_supabase_local_ports_available');
    expect(script).toContain('Supabase local port preflight failed for project');
    expect(script).toContain(
      'Override SUPABASE_LOCAL_PORT_BASE or the specific SUPABASE_LOCAL_*_PORT values',
    );
    expect(script).toContain(
      'upsert_env "${ENV_FILE}" "SUPABASE_LOCAL_PORT_BASE" "${SUPABASE_LOCAL_PORT_BASE}"',
    );
  });

  test('uses app project identity for Supabase ports independently from namespace', () => {
    const scannerEnv = getGeneratedFileContent(
      'local-example-test',
      'infra/minikube/.env.example',
      {},
      'scanner',
    );
    const scannerNamespace = getGeneratedFileContent(
      'local-example-test',
      'infra/minikube/k8s/namespace.yaml',
      {},
      'scanner',
    );
    const chessEnv = getGeneratedFileContent(
      'local-example-test',
      'infra/minikube/.env.example',
      {},
      'chess',
    );

    expect(scannerNamespace).toContain('name: local-example-test');
    expect(scannerEnv).toContain('SUPABASE_LOCAL_PORT_BASE=64020');
    expect(chessEnv).toContain('SUPABASE_LOCAL_PORT_BASE=62200');
    expect(scannerEnv).not.toContain('SUPABASE_LOCAL_PORT_BASE=62200');
  });

  test('generates canonical Supabase project identity checks', () => {
    const script = getGeneratedFileContent(
      'scanner',
      'infra/minikube/scripts/supabase-local-env.sh',
    );
    const status = getGeneratedFileContent('scanner', 'infra/minikube/scripts/status.sh');

    expect(script).toContain('EXPECTED_SUPABASE_PROJECT_ID="scanner"');
    expect(script).toContain('write_supabase_project_identity_for_new_config');
    expect(script).toContain('validate_supabase_project_identity');
    expect(script).toContain('project_id = "{expected}"');
    expect(script).toContain(
      'The existing local Supabase project belongs to a different identity.',
    );
    expect(script).toContain(
      'Destroy the invalid local stack and its project-owned resources, then run Infra Up again.',
    );
    expect(script).toContain(
      'supabase --workdir "${SUPABASE_PROJECT_DIR}" init --yes >/dev/null\n  write_supabase_project_identity_for_new_config',
    );
    expect(script).toContain('validate_supabase_project_identity\nconfigure_supabase_local_ports');
    expect(script).toContain(
      'validate_supabase_project_identity\n  assert_supabase_local_ports_available',
    );
    expect(script).toContain('validate_supabase_project_identity\nrun_checked_command');
    expect(script).not.toContain('basename "${APP_SOURCE_DIR}"');
    expect(script).not.toContain('_minikube');

    expect(status).toContain('EXPECTED_SUPABASE_PROJECT_ID="scanner"');
    expect(status).toContain('reject_supabase_project_id_override');
    expect(status).toContain('validate_supabase_project_identity');
    expect(status).toContain('Supabase project identity mismatch.');
    expect(status).toContain('Destroy the invalid local stack and run Infra Up again.');
    expect(status).not.toContain('write_supabase_project_identity_for_new_config');
    expect(status).not.toContain('configure_supabase_local_ports');
    expect(status).not.toContain('_minikube');
  });

  test('patches only a newly initialized Supabase config to the canonical project identity', () => {
    const run = runGeneratedSupabaseScript({
      projectId: 'scanner',
      existingConfig: null,
    });

    expect(run.status).toBe(0);
    expect(readFileSync(run.configPath, 'utf-8')).toContain('project_id = "scanner"');
    expect(readFileSync(run.supabaseLogPath, 'utf-8')).toContain(
      '--workdir ' + run.root + ' init --yes',
    );
  });

  test('rejects an existing Supabase config with a different project identity before lifecycle work', () => {
    const run = runGeneratedSupabaseScript({
      projectId: 'scanner',
      existingConfig: 'project_id = "minikube"\n[api]\nport = 54321\n',
    });

    expect(run.status).not.toBe(0);
    expect(run.combinedOutput).toContain('Supabase project identity mismatch.');
    expect(run.combinedOutput).toContain('Expected "scanner", found "minikube".');
    expect(run.combinedOutput).toContain(
      'Destroy the invalid local stack and its project-owned resources, then run Infra Up again.',
    );
    expect(readFileSync(run.configPath, 'utf-8')).toContain('project_id = "minikube"');
    expect(readFileSync(run.supabaseLogPath, 'utf-8')).not.toContain('--workdir');
  });

  test('rejects an existing Supabase config with missing top-level project identity', () => {
    const run = runGeneratedSupabaseScript({
      projectId: 'scanner',
      existingConfig: '[api]\nport = 54321\n',
    });

    expect(run.status).not.toBe(0);
    expect(run.combinedOutput).toContain('Expected "scanner", found missing.');
    expect(readFileSync(run.configPath, 'utf-8')).not.toContain('project_id = "scanner"');
    expect(readFileSync(run.supabaseLogPath, 'utf-8')).not.toContain('--workdir');
  });

  test('rejects ambient SUPABASE_PROJECT_ID before Supabase CLI operations', () => {
    const run = runGeneratedSupabaseScript({
      projectId: 'scanner',
      existingConfig: 'project_id = "scanner"\n[api]\nport = 54321\n',
      env: {
        SUPABASE_PROJECT_ID: 'minikube',
      },
    });

    expect(run.status).not.toBe(0);
    expect(run.combinedOutput).toContain(
      'SUPABASE_PROJECT_ID must not be set for generated local Infra scripts.',
    );
    expect(readFileSync(run.supabaseLogPath, 'utf-8')).not.toContain('--workdir');
  });

  test('rejects empty Supabase project identity before Supabase CLI operations', () => {
    const run = runGeneratedSupabaseScript({
      projectId: 'plain',
      supabaseProjectId: null,
      existingConfig: null,
    });

    expect(run.status).not.toBe(0);
    expect(run.combinedOutput).toContain(
      'Cannot run local Supabase infrastructure: expected Supabase project identity is empty.',
    );
    expect(readFileSync(run.supabaseLogPath, 'utf-8')).not.toContain('--workdir');
    expect(readFileSync(run.supabaseLogPath, 'utf-8')).not.toContain('init --yes');
    expect(() => readFileSync(run.configPath, 'utf-8')).toThrow();
  });

  test('requires python before Supabase init mutates the workdir', () => {
    const run = runGeneratedSupabaseScript({
      projectId: 'scanner',
      existingConfig: null,
      withoutPython: true,
    });

    expect(run.status).not.toBe(0);
    expect(run.combinedOutput).toContain(
      'python3 is required to reconcile supabase/config.toml before local Supabase startup.',
    );
    expect(readFileSync(run.supabaseLogPath, 'utf-8')).not.toContain('--workdir');
    expect(readFileSync(run.supabaseLogPath, 'utf-8')).not.toContain('init --yes');
    expect(() => readFileSync(run.configPath, 'utf-8')).toThrow();
  });

  test('generates bootstrap logic that retries unhealthy local Supabase startup once', () => {
    const script = getGeneratedFileContent('chess', 'infra/minikube/scripts/supabase-local-env.sh');

    expect(script).toContain('start_supabase_local_stack() {');
    expect(script).toContain(
      'Supabase local start failed. Stopping stale local stack and retrying once...',
    );
    expect(script).toContain(
      'supabase --workdir "${SUPABASE_PROJECT_DIR}" stop --no-backup >/dev/null 2>&1 || true',
    );
    expect(script).toContain('Supabase local start failed after retry.');
    expect(script).toContain('start_supabase_local_stack');
    expect(
      countOccurrences(script, 'supabase --workdir "${SUPABASE_PROJECT_DIR}" start >/dev/null'),
    ).toBe(2);
    expect(
      countOccurrences(script, 'supabase --workdir "${SUPABASE_PROJECT_DIR}" stop --no-backup'),
    ).toBe(1);
  });

  test('generates canonical Supabase workdir and required CLI capability checks', () => {
    const script = getGeneratedFileContent('chess', 'infra/minikube/scripts/supabase-local-env.sh');

    expect(script).toContain('SUPABASE_PROJECT_DIR="${SUPABASE_PROJECT_DIR:-${ROOT_DIR}}"');
    expect(script).toContain('require_expected_supabase_project_identity');
    expect(script).toContain(
      'require_expected_supabase_project_identity\nreject_supabase_project_id_override\nrequire_supabase_cli_capabilities',
    );
    expect(script).toContain('supabase CLI >= 2.106.0 is required');
    expect(script).toContain('supabase CLI does not support required global --workdir flag');
    expect(script).toContain('supabase CLI does not support required migration up --local command');
    expect(script).toContain(
      'python3 is required to reconcile supabase/config.toml before local Supabase startup.',
    );
    expect(script).toContain('psql is required but not installed');
    expect(script).toContain('supabase --workdir "${SUPABASE_PROJECT_DIR}" init --yes');
    expect(script).toContain('supabase --workdir "${SUPABASE_PROJECT_DIR}" migration up --local');
    expect(script).toContain('psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -q -f "${sql_file}"');
  });

  test('generates profile reconciliation and live verification flow when profile table is configured', () => {
    const overrides = {
      auth: {
        profile: {
          table: 'profiles',
          fields: ['email', 'displayName'],
        },
      },
    } satisfies Partial<InfraManifestInput>;
    const script = getGeneratedFileContent(
      'chess',
      'infra/minikube/scripts/supabase-local-env.sh',
      overrides,
    );
    const status = getGeneratedFileContent('chess', 'infra/minikube/scripts/status.sh', overrides);

    expect(script).toContain('SUPABASE_PROFILE_ENABLED="true"');
    expect(script).toContain(
      'SUPABASE_PROFILE_RECONCILE_FILE="${SUPABASE_PROJECT_DIR}/supabase/generated/auth_profiles.sql"',
    );
    expect(script).toContain('Generated profile reconciliation');
    expect(script).toContain('SQL file: ${sql_file}');
    expect(script).toContain('Supabase project workdir: ${SUPABASE_PROJECT_DIR}');
    expect(script).toContain('Exit status: ${status}');
    expect(script).toContain('ankhorage_internal.generated_schema_state');
    expect(script).toContain('check_immutable_migrations_applied');
    expect(status).toContain('- immutable migrations: applied');
    expect(status).toContain('- immutable migrations: pending');
    expect(status).toContain('- profile reconciliation: applied, checksum matches');
    expect(status).toContain('- profile schema: verified');
    expect(status).toContain('reserved conflicting identity table public.users exists');
    expect(status).toContain('stale managed profile column');
    expect(status).toContain('own-profile SELECT policy is missing or has unsafe definition');
    expect(status).toContain('unexpected profile table RLS policy exists');
    expect(status).toContain(
      "has_any_column_privilege('anon', format('public.%I', profile_table), 'SELECT')",
    );
    expect(status).toContain(
      "has_any_column_privilege('anon', format('public.%I', profile_table), 'INSERT')",
    );
    expect(status).toContain(
      "has_any_column_privilege('anon', format('public.%I', profile_table), 'UPDATE')",
    );
    expect(status).toContain(
      "has_any_column_privilege('anon', format('public.%I', profile_table), 'REFERENCES')",
    );
    expect(status).toContain(
      "has_any_column_privilege('authenticated', format('public.%I', profile_table), 'INSERT')",
    );
    expect(status).toContain(
      "has_any_column_privilege('authenticated', format('public.%I', profile_table), 'REFERENCES')",
    );
    expect(status).toContain(
      'authenticated role must not have profile table INSERT, DELETE, or REFERENCES privilege',
    );
    expect(status).toContain(
      'authenticated role has unexpected UPDATE privilege on profile column',
    );
    expect(status).toContain('generated trigger function execute privilege must be revoked');
  });

  test('does not reject SUPABASE_PROJECT_ID for non-Supabase status checks', () => {
    const run = runGeneratedStatusScript({
      manifest: {
        deployment: {
          target: 'minikube',
          monitoring: false,
        },
        plugins: [],
      },
      supabaseProjectId: null,
      env: {
        SUPABASE_PROJECT_ID: 'ambient-project',
      },
    });

    expect(run.status).toBe(0);
    expect(run.combinedOutput).not.toContain(
      'SUPABASE_PROJECT_ID must not be set for generated local Infra scripts.',
    );
    expect(run.kubectlLog).toContain('get all -n plain');
  });
});

function getGeneratedFileContent(
  namespace: string,
  filePath: string,
  overrides: Partial<InfraManifestInput> = {},
  supabaseProjectId = namespace,
): string {
  const artifact = generateMinikubeBaseArtifacts({
    manifest: createInfraManifest(overrides),
    namespace,
    supabaseProjectId,
    extraResources: [],
    extraEnvEntries: [],
  }).find((file) => file.path === filePath);

  if (!artifact) {
    throw new Error(`Expected generated artifact at ${filePath}`);
  }

  return artifact.content;
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

function createInfraManifest(overrides: Partial<InfraManifestInput> = {}): InfraManifestInput {
  return {
    deployment: {
      target: 'minikube',
      monitoring: false,
    },
    auth: {
      scope: 'global',
      provider: 'supabase',
      authorization: {
        kind: 'RBAC',
        engine: 'native',
      },
    },
    database: {
      provider: 'supabase',
      tier: 'dev',
    },
    networking: {
      cdn: false,
    },
    plugins: [],
    ...overrides,
    auth: {
      scope: 'global',
      provider: 'supabase',
      authorization: {
        kind: 'RBAC',
        engine: 'native',
      },
      ...overrides.auth,
    },
  };
}

function runGeneratedSupabaseScript(args: {
  projectId: string;
  supabaseProjectId?: string | null;
  existingConfig: string | null;
  env?: Record<string, string>;
  withoutPython?: boolean;
}): {
  status: number | null;
  combinedOutput: string;
  root: string;
  configPath: string;
  supabaseLogPath: string;
} {
  const tempRoot = mkdtempSync(join(tmpdir(), 'infra-supabase-identity-'));
  const root = join(tempRoot, 'infra', 'minikube');
  const scriptsDir = join(root, 'scripts');
  const supabaseDir = join(root, 'supabase');
  const binDir = join(tempRoot, 'bin');
  const appSourceDir = join(tempRoot, 'app');
  const scriptPath = join(scriptsDir, 'supabase-local-env.sh');
  const configPath = join(supabaseDir, 'config.toml');
  const supabaseLogPath = join(tempRoot, 'supabase.log');

  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(appSourceDir, { recursive: true });
  writeFileSync(join(root, '.env.example'), '');
  writeFileSync(supabaseLogPath, '');

  if (args.existingConfig !== null) {
    mkdirSync(supabaseDir, { recursive: true });
    writeFileSync(configPath, args.existingConfig);
  }

  const script = getGeneratedFileContent(
    args.projectId,
    'infra/minikube/scripts/supabase-local-env.sh',
    {},
    args.supabaseProjectId === undefined ? args.projectId : args.supabaseProjectId,
  );
  writeFileSync(scriptPath, script);
  chmodSync(scriptPath, 0o755);

  const supabaseStubPath = join(binDir, 'supabase');
  writeFileSync(
    supabaseStubPath,
    `#!/bin/bash
set -euo pipefail
printf '%s\\n' "$*" >> "\${SUPABASE_STUB_LOG}"

if [[ "\${1:-}" == "--version" ]]; then
  echo "supabase 2.106.0"
  exit 0
fi

if [[ "\${1:-}" == "status" && "\${2:-}" == "--help" ]]; then
  echo "--workdir"
  exit 0
fi

if [[ "\${1:-}" == "migration" && "\${2:-}" == "up" && "\${3:-}" == "--help" ]]; then
  echo "--local"
  exit 0
fi

if [[ "\${1:-}" == "--workdir" && "\${3:-}" == "init" && "\${4:-}" == "--yes" ]]; then
  mkdir -p "\${2}/supabase"
  printf '%s\\n' 'project_id = "minikube"' '[api]' 'port = 54321' > "\${2}/supabase/config.toml"
  exit 0
fi

if [[ "\${1:-}" == "--workdir" && "\${3:-}" == "status" && "\${4:-}" == "-o" && "\${5:-}" == "env" ]]; then
  cat <<'ENV'
DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
API_URL=http://127.0.0.1:54321
ANON_KEY=anon
SERVICE_ROLE_KEY=service
JWT_SECRET=secret
ENV
  exit 0
fi

if [[ "\${1:-}" == "--workdir" && "\${3:-}" == "status" ]]; then
  exit 0
fi

if [[ "\${1:-}" == "--workdir" && "\${3:-}" == "migration" && "\${4:-}" == "up" && "\${5:-}" == "--local" ]]; then
  exit 0
fi

echo "unexpected supabase call: $*" >&2
exit 1
`,
  );
  chmodSync(supabaseStubPath, 0o755);

  const psqlStubPath = join(binDir, 'psql');
  writeFileSync(
    psqlStubPath,
    `#!/bin/bash
exit 0
`,
  );
  chmodSync(psqlStubPath, 0o755);

  const result = spawnSync('/bin/bash', [scriptPath], {
    cwd: tempRoot,
    env: {
      ...(args.withoutPython ? {} : process.env),
      PATH: args.withoutPython ? binDir : `${binDir}:${process.env.PATH ?? ''}`,
      APP_SOURCE_DIR: appSourceDir,
      SUPABASE_STUB_LOG: supabaseLogPath,
      ...args.env,
    },
    encoding: 'utf-8',
  });

  return {
    status: result.status,
    combinedOutput: `${result.stdout}${result.stderr}`,
    root,
    configPath,
    supabaseLogPath,
  };
}

function runGeneratedStatusScript(args: {
  manifest: InfraManifestInput;
  supabaseProjectId: string | null;
  env?: Record<string, string>;
}): {
  status: number | null;
  combinedOutput: string;
  kubectlLog: string;
} {
  const tempRoot = mkdtempSync(join(tmpdir(), 'infra-status-'));
  const root = join(tempRoot, 'infra', 'minikube');
  const scriptsDir = join(root, 'scripts');
  const binDir = join(tempRoot, 'bin');
  const scriptPath = join(scriptsDir, 'status.sh');
  const kubectlLogPath = join(tempRoot, 'kubectl.log');

  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(root, '.env.example'), '');
  writeFileSync(kubectlLogPath, '');

  const artifact = generateMinikubeBaseArtifacts({
    manifest: args.manifest,
    namespace: 'plain',
    supabaseProjectId: args.supabaseProjectId,
    extraResources: [],
    extraEnvEntries: [],
  }).find((file) => file.path === 'infra/minikube/scripts/status.sh');

  if (!artifact) {
    throw new Error('Expected generated status.sh artifact');
  }

  writeFileSync(scriptPath, artifact.content);
  chmodSync(scriptPath, 0o755);

  const kubectlStubPath = join(binDir, 'kubectl');
  writeFileSync(
    kubectlStubPath,
    `#!/bin/bash
set -euo pipefail
printf '%s\\n' "$*" >> "\${KUBECTL_STUB_LOG}"

if [[ "\${1:-}" == "config" && "\${2:-}" == "current-context" ]]; then
  echo "minikube"
  exit 0
fi

if [[ "\${1:-}" == "cluster-info" ]]; then
  echo "Kubernetes control plane is running"
  exit 0
fi

if [[ "\${1:-}" == "get" && "\${2:-}" == "namespace" ]]; then
  exit 0
fi

if [[ "\${1:-}" == "get" && "\${2:-}" == "all" ]]; then
  echo "No resources found"
  exit 0
fi

echo "unexpected kubectl call: $*" >&2
exit 1
`,
  );
  chmodSync(kubectlStubPath, 0o755);

  const result = spawnSync('/bin/bash', [scriptPath], {
    cwd: tempRoot,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      KUBECTL_STUB_LOG: kubectlLogPath,
      ...args.env,
    },
    encoding: 'utf-8',
  });

  return {
    status: result.status,
    combinedOutput: `${result.stdout}${result.stderr}`,
    kubectlLog: readFileSync(kubectlLogPath, 'utf-8'),
  };
}
