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
    expect(script).toContain('supabase stop --no-backup >/dev/null 2>&1 || true');
    expect(script).toContain('Supabase local start failed after retry.');
    expect(script).toContain('start_supabase_local_stack');
    expect(countOccurrences(script, 'supabase start >/dev/null')).toBe(2);
    expect(countOccurrences(script, 'supabase stop --no-backup')).toBe(1);
  });
});

function getGeneratedFileContent(namespace: string, filePath: string): string {
  const artifact = generateMinikubeBaseArtifacts({
    manifest: createInfraManifest(),
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

function createInfraManifest(): InfraManifestInput {
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
  };
}
