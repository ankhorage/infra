import { describe, expect, test } from 'bun:test';

import { generateInfrastructure } from '../../../index';
import { createAppManifest } from '../../../testSupport';
import type { InfraManifestInput } from '../../../types';

describe('generateMinikubeBaseArtifacts app-owned cluster model', () => {
  test('uses the canonical app slug as the only Minikube profile identity', () => {
    const result = generateInfrastructure(createSupabaseManifest(), {
      namespaceHint: 'ignored',
      appManifest: createAppManifest('chess'),
    });
    const envExample = getFile(result.files, 'infra/minikube/.env.example');
    const upScript = getFile(result.files, 'infra/minikube/scripts/up.sh');
    const downScript = getFile(result.files, 'infra/minikube/scripts/down.sh');
    const destroyScript = getFile(result.files, 'infra/minikube/scripts/destroy.sh');

    expect(envExample).toContain('ANKH_APP_SLUG=chess');
    expect(envExample).not.toContain('MINIKUBE_PROFILE=');
    expect(upScript).toContain('PROFILE="${ANKH_APP_SLUG:-chess}"');
    expect(upScript).toContain('minikube start -p "${PROFILE}"');
    expect(upScript).not.toContain('PROFILE="${MINIKUBE_PROFILE:-minikube}"');
    expect(downScript).toContain('minikube stop -p "${PROFILE}"');
    expect(destroyScript).toContain('minikube delete -p "${PROFILE}"');
  });

  test('generates fixed app and supabase namespaces instead of slug namespaces', () => {
    const result = generateInfrastructure(createSupabaseManifest(), {
      appManifest: createAppManifest('uwm'),
    });
    const paths = result.files.map((file) => file.path);
    const appNamespace = getFile(result.files, 'infra/minikube/k8s/namespaces/app.yaml');
    const supabaseNamespace = getFile(result.files, 'infra/minikube/k8s/namespaces/supabase.yaml');
    const appDeployment = getFile(result.files, 'infra/minikube/k8s/app/deployment.yaml');
    const postgres = getFile(result.files, 'infra/minikube/k8s/supabase/postgres.yaml');

    expect(paths).toContain('infra/minikube/k8s/namespaces/app.yaml');
    expect(paths).toContain('infra/minikube/k8s/namespaces/supabase.yaml');
    expect(paths).not.toContain('infra/minikube/k8s/namespace.yaml');
    expect(appNamespace).toContain('name: app');
    expect(supabaseNamespace).toContain('name: supabase');
    expect(appDeployment).toContain('namespace: app');
    expect(appDeployment).toContain('name: supabase-public-runtime');
    expect(postgres).toContain('namespace: supabase');
  });

  test('removes host-level Supabase runtime ownership from generated files', () => {
    const result = generateInfrastructure(createSupabaseManifest(), {
      appManifest: createAppManifest('scanner'),
    });
    const serialized = JSON.stringify(result.files);

    expect(result.files.map((file) => file.path)).not.toContain(
      'infra/minikube/scripts/supabase-local-env.sh',
    );
    expect(serialized).not.toContain('supabase start');
    expect(serialized).not.toContain('supabase stop');
    expect(serialized).not.toContain('supabase status');
    expect(serialized).not.toContain('SUPABASE_PROJECT_DIR');
    expect(serialized).not.toContain('SUPABASE_LOCAL_PORT');
    expect(serialized).not.toContain('supabase_*_');
    expect(serialized).not.toContain('supabase-auth-secrets');
  });

  test('keeps Supabase migration history but executes against the Kubernetes DB URL', () => {
    const result = generateInfrastructure(createSupabaseManifest(), {
      appManifest: createAppManifest('scanner'),
    });
    const upScript = getFile(result.files, 'infra/minikube/scripts/up.sh');
    const readme = getFile(result.files, 'infra/minikube/README.md');

    expect(upScript).toContain('supabase migration up --db-url "${SUPABASE_DB_URL}"');
    expect(upScript).not.toContain('migration up --local');
    expect(upScript).toContain('SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgres://postgres:');
    expect(readme).toContain('Migration authoring/history remains Supabase');
  });

  test('defines reset separately from down and destroy', () => {
    const result = generateInfrastructure(createSupabaseManifest(), {
      appManifest: createAppManifest('uwm'),
    });
    const resetScript = getFile(result.files, 'infra/minikube/scripts/reset.sh');
    const downScript = getFile(result.files, 'infra/minikube/scripts/down.sh');

    expect(resetScript).toContain('ANKH_RESET_CONFIRM');
    expect(resetScript).toContain('delete namespace app');
    expect(resetScript).toContain('delete namespace supabase');
    expect(resetScript).toContain('does not delete the Minikube profile');
    expect(downScript).toContain('minikube stop -p "${PROFILE}"');
    expect(downScript).not.toContain('delete namespace');
  });

  test('treats port-forwards as slug-owned lifecycle resources', () => {
    const result = generateInfrastructure(createSupabaseManifest(), {
      appManifest: createAppManifest('uwm'),
    });
    const portForwardScript = getFile(result.files, 'infra/minikube/scripts/port-forward.sh');
    const statusScript = getFile(result.files, 'infra/minikube/scripts/status.sh');
    const upScript = getFile(result.files, 'infra/minikube/scripts/up.sh');
    const downScript = getFile(result.files, 'infra/minikube/scripts/down.sh');

    expect(portForwardScript).toContain('service/app-runtime');
    expect(portForwardScript).toContain('service/gateway');
    expect(portForwardScript).toContain('service/studio');
    expect(portForwardScript).toContain('service/postgres');
    expect(portForwardScript).toContain('${PROFILE}-${1}.pid');
    expect(portForwardScript).toContain('crashed stale_pid');
    expect(statusScript).toContain('port-forward.sh" status all');
    expect(upScript).toContain('start supabase-gateway');
    expect(upScript).toContain('start db-migration');
    expect(downScript).toContain('port-forward.sh" stop all');
  });
});

function createSupabaseManifest(): InfraManifestInput {
  return {
    deployment: {
      target: 'minikube',
      monitoring: false,
    },
    auth: {
      scope: 'global',
      provider: 'supabase',
    },
    database: {
      provider: 'supabase',
      tier: 'dev',
    },
    storage: {
      provider: 'supabase',
      buckets: ['assets'],
    },
    plugins: [],
  };
}

function getFile(files: readonly { path: string; content: string }[], path: string): string {
  const file = files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`Missing generated file: ${path}`);
  return file.content;
}
