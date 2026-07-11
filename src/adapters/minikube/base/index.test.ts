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
      countOccurrences(
        script,
        'supabase --workdir "${SUPABASE_PROJECT_DIR}" stop --no-backup',
      ),
    ).toBe(1);
  });

  test('generates canonical Supabase workdir and required CLI capability checks', () => {
    const script = getGeneratedFileContent('chess', 'infra/minikube/scripts/supabase-local-env.sh');

    expect(script).toContain('SUPABASE_PROJECT_DIR="${SUPABASE_PROJECT_DIR:-${ROOT_DIR}}"');
    expect(script).toContain('supabase CLI >= 2.106.0 is required');
    expect(script).toContain('supabase CLI does not support required global --workdir flag');
    expect(script).toContain('supabase CLI does not support required migration up --local command');
    expect(script).toContain(
      'supabase CLI does not support required db query --local --file command',
    );
    expect(script).toContain('supabase --workdir "${SUPABASE_PROJECT_DIR}" init --yes');
    expect(script).toContain('supabase --workdir "${SUPABASE_PROJECT_DIR}" migration up --local');
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
    const status = getGeneratedFileContent(
      'chess',
      'infra/minikube/scripts/status.sh',
      overrides,
    );

    expect(script).toContain('SUPABASE_PROFILE_ENABLED="true"');
    expect(script).toContain(
      'SUPABASE_PROFILE_RECONCILE_FILE="${SUPABASE_PROJECT_DIR}/supabase/generated/auth_profiles.sql"',
    );
    expect(script).toContain('Generated profile reconciliation');
    expect(script).toContain('SQL file: ${sql_file}');
    expect(script).toContain('Supabase project workdir: ${SUPABASE_PROJECT_DIR}');
    expect(script).toContain('Exit status: ${status}');
    expect(script).toContain('ankhorage_internal.generated_schema_state');
    expect(status).toContain('- immutable migrations: applied');
    expect(status).toContain('- profile reconciliation: applied, checksum matches');
    expect(status).toContain('- profile schema: verified');
    expect(status).toContain('reserved conflicting identity table public.users exists');
    expect(status).toContain('stale managed profile column');
  });
});

function getGeneratedFileContent(
  namespace: string,
  filePath: string,
  overrides: Partial<InfraManifestInput> = {},
): string {
  const artifact = generateMinikubeBaseArtifacts({
    manifest: createInfraManifest(overrides),
    namespace,
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
