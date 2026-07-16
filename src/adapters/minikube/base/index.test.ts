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
    expect(upScript).toContain('export SUPABASE_DB_URL PGSSLMODE=disable');
    expect(upScript).not.toContain('migration up --local');
    expect(upScript).toContain('cd "${ROOT_DIR}"');
    expect(upScript).toContain('set_required_env_default POSTGRES_PASSWORD "$(random_hex 32)"');
    expect(upScript).not.toContain('set_env_default POSTGRES_PASSWORD "$(random_base64');
    expect(upScript).toContain(
      'set_required_env_default SUPABASE_DB_URL "postgres://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${SUPABASE_DB_FORWARD_LOCAL_PORT}/postgres?sslmode=disable"',
    );
    expect(upScript).toContain('bootstrap_supabase_database');
    expect(readme).toContain('Migration authoring/history remains Supabase');
  });

  test('lists and generates Supabase Kubernetes bootstrap and gateway contract files', () => {
    const result = generateInfrastructure(createSupabaseManifest(), {
      appManifest: createAppManifest('scanner'),
    });
    const paths = result.files.map((file) => file.path);
    const readme = getFile(result.files, 'infra/minikube/README.md');
    const kustomization = getFile(result.files, 'infra/minikube/k8s/kustomization.yaml');
    const bootstrap = getFile(result.files, 'infra/minikube/k8s/supabase/bootstrap.sql');
    const postgresInit = getFile(
      result.files,
      'infra/minikube/k8s/supabase/postgres.init.configmap.yaml',
    );
    const postgres = getFile(result.files, 'infra/minikube/k8s/supabase/postgres.yaml');
    const auth = getFile(result.files, 'infra/minikube/k8s/supabase/auth.yaml');
    const envExample = getFile(result.files, 'infra/minikube/.env.example');
    const gatewayTemplate = getFile(
      result.files,
      'infra/minikube/k8s/supabase/gateway.template.yml',
    );
    const gateway = getFile(result.files, 'infra/minikube/k8s/supabase/gateway.yaml');
    const storage = getFile(result.files, 'infra/minikube/k8s/supabase/storage.yaml');
    const kongEntrypoint = getFile(result.files, 'infra/minikube/k8s/supabase/kong-entrypoint.sh');

    expect(paths).toContain('infra/minikube/k8s/supabase/bootstrap.sql');
    expect(paths).toContain('infra/minikube/k8s/supabase/postgres.init.configmap.yaml');
    expect(paths).toContain('infra/minikube/k8s/supabase/gateway.template.yml');
    expect(paths).toContain('infra/minikube/k8s/supabase/kong-entrypoint.sh');
    expect(paths).not.toContain('infra/minikube/k8s/supabase/secrets.yaml');
    expect(readme).toContain('supabase/bootstrap.sql');
    expect(readme).toContain('supabase/postgres.init.configmap.yaml');
    expect(readme).toContain('supabase/gateway.template.yml');
    expect(readme).toContain('supabase/kong-entrypoint.sh');
    expect(kustomization).not.toContain('supabase/secrets.yaml');
    expect(kustomization).not.toContain('gateway.configmap.yaml');
    expect(kustomization).toContain('supabase/postgres.init.configmap.yaml');
    expect(bootstrap).toContain('CREATE SCHEMA IF NOT EXISTS auth');
    expect(bootstrap).toContain(
      'GRANT anon, authenticated, service_role TO supabase_storage_admin',
    );
    expect(postgresInit).toContain('alter role postgres with superuser');
    expect(postgresInit).toContain('grant pg_read_server_files to supabase_admin');
    expect(postgresInit).toContain('grant execute on function pg_read_file(text) to public');
    expect(postgres).toContain('name: POSTGRES_USER');
    expect(postgres).toContain('value: postgres');
    expect(postgres).toContain('name: PGPORT');
    expect(postgres).toContain(
      'mountPath: /docker-entrypoint-initdb.d/99-ankhorage-local-dev-extensions.sql',
    );
    expect(postgres).toContain('config_file=/etc/postgresql/postgresql.conf');
    expect(gatewayTemplate).toContain('keyauth_credentials');
    expect(gatewayTemplate).toContain('request-transformer');
    expect(kongEntrypoint).toContain('LUA_AUTH_EXPR');
    expect(auth).toContain('name: GOTRUE_JWT_EXP');
    expect(auth).toContain('key: JWT_EXPIRY');
    expect(auth).toContain(
      'postgres://supabase_auth_admin:$(POSTGRES_PASSWORD)@postgres.supabase.svc.cluster.local:5432/postgres?search_path=auth&sslmode=disable',
    );
    expect(storage).toContain(
      'postgres://supabase_storage_admin:$(POSTGRES_PASSWORD)@postgres.supabase.svc.cluster.local:5432/postgres?search_path=storage&sslmode=disable',
    );
    expect(envExample).toContain('PGRST_DB_SCHEMAS=public,storage,graphql_public');
    expect(auth).toContain('name: GOTRUE_EXTERNAL_EMAIL_ENABLED');
    expect(auth).toContain('key: ENABLE_EMAIL_SIGNUP');
    expect(auth).toContain('name: GOTRUE_SMTP_HOST');
    expect(auth).toContain('name: GOTRUE_SMTP_PORT');
    expect(auth).toContain('name: GOTRUE_SMTP_USER');
    expect(auth).toContain('name: GOTRUE_SMTP_PASS');
    expect(gatewayTemplate).toContain('name: realtime-v1-rest-openapi');
    expect(gatewayTemplate).toContain('paths: [/realtime/v1/api/openapi]');
    expect(gatewayTemplate).toContain('name: realtime-v1-rest-tenants');
    expect(gatewayTemplate).toContain('paths: [/realtime/v1/api/tenants]');
    expect(gatewayTemplate).toContain('name: request-termination');
    expect(gatewayTemplate).toContain('status_code: 403');
    expect(gateway).toContain('mountPath: /home/kong/temp.yml');
    expect(gateway).toContain('subPath: temp.yml');
    expect(gateway).toContain('mountPath: /home/kong/kong-entrypoint.sh');
    expect(gateway).toContain('command: ["kong", "health"]');
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

  test('keeps reset scoped to app namespace when Supabase is not generated', () => {
    const result = generateInfrastructure(
      {
        deployment: {
          target: 'minikube',
          monitoring: false,
        },
      },
      {
        appManifest: createAppManifest('plain'),
      },
    );
    const paths = result.files.map((file) => file.path);
    const resetScript = getFile(result.files, 'infra/minikube/scripts/reset.sh');
    const statusScript = getFile(result.files, 'infra/minikube/scripts/status.sh');

    expect(paths).not.toContain('infra/minikube/k8s/namespaces/supabase.yaml');
    expect(resetScript).toContain('delete namespace app');
    expect(resetScript).not.toContain('delete namespace supabase');
    expect(resetScript).not.toContain('namespaces/supabase.yaml');
    expect(statusScript).toContain('for namespace in app; do');
  });

  test('uses generated Supabase runtime ownership as an immutable script decision', () => {
    const result = generateInfrastructure(createSupabaseManifest(), {
      appManifest: createAppManifest('scanner'),
    });
    const envExample = getFile(result.files, 'infra/minikube/.env.example');
    const upScript = getFile(result.files, 'infra/minikube/scripts/up.sh');

    expect(envExample).not.toContain('SUPABASE_RUNTIME_ENABLED=');
    expect(upScript).toContain('SUPABASE_RUNTIME_ENABLED="true"');
    expect(upScript).not.toContain('SUPABASE_RUNTIME_ENABLED="${SUPABASE_RUNTIME_ENABLED');
  });

  test('wires configured OAuth providers into GoTrue runtime env without serializing secrets', () => {
    const result = generateInfrastructure(
      {
        ...createSupabaseManifest(),
        secretStore: {
          provider: 'supabase-vault',
        },
        auth: {
          scope: 'global',
          provider: 'supabase',
          oauth: {
            enabled: true,
            callbackRoute: '/auth/callback',
            providers: [
              {
                id: 'google',
                enabled: true,
                credentialsRef: 'auth/oauth/google',
              },
            ],
          },
        },
      },
      {
        appManifest: createAppManifest('oauth-app'),
      },
    );
    const envExample = getFile(result.files, 'infra/minikube/.env.example');
    const upScript = getFile(result.files, 'infra/minikube/scripts/up.sh');

    expect(envExample).toContain('# google: auth/oauth/google');
    expect(envExample).toContain('GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=');
    expect(envExample).toContain('GOTRUE_EXTERNAL_GOOGLE_SECRET=');
    expect(upScript).toContain('GOTRUE_EXTERNAL_GOOGLE_ENABLED=true');
    expect(upScript).toContain(
      'GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=${GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID}',
    );
    expect(upScript).toContain('credentialsRef auth/oauth/google');
    expect(upScript).toContain("resolve_vault_secret_field 'auth/oauth/google' 'clientSecret'");
    expect(upScript).not.toContain('sentinel-client-secret-value');
  });

  test('generates required secrets even when copied env example contains empty keys', () => {
    const result = generateInfrastructure(createSupabaseManifest(), {
      appManifest: createAppManifest('scanner'),
    });
    const upScript = getFile(result.files, 'infra/minikube/scripts/up.sh');

    expect(upScript).toContain('load_env_file_preserving_process_env');
    expect(upScript).toContain('APP_IMAGE="${APP_IMAGE:-}"');
    expect(upScript).toContain(
      'load_env_file_preserving_process_env\nSUPABASE_RUNTIME_ENABLED="true"',
    );
    expect(upScript.indexOf('load_env_file_preserving_process_env')).toBeLessThan(
      upScript.lastIndexOf('APP_IMAGE="${APP_IMAGE:-ankh/scanner:dev}"'),
    );
    expect(upScript).toContain('set_required_env_default POSTGRES_PASSWORD "$(random_hex 32)"');
    expect(upScript).toContain('write_env_value "${key}" "${value}"');
    expect(upScript).toContain('set_optional_env_default SMTP_USER ""');
  });

  test('starts Supabase schema owners before app migrations and profile reconciliation', () => {
    const result = generateInfrastructure(createSupabaseManifest(), {
      appManifest: createAppManifest('scanner'),
    });
    const upScript = getFile(result.files, 'infra/minikube/scripts/up.sh');

    expect(upScript).toContain('apply_supabase_runtime_workloads');
    expect(upScript).toContain('exec deployment/postgres -- psql -U postgres');
    expect(upScript).toContain('create schema if not exists vault');
    expect(upScript).toContain('grant execute on function pg_read_file(text) to public');
    expect(upScript.indexOf('postgres.init.configmap.yaml')).toBeLessThan(
      upScript.indexOf('postgres.pvc.yaml'),
    );
    expect(upScript.lastIndexOf('  wait_for_supabase_database')).toBeLessThan(
      upScript.lastIndexOf('  bootstrap_supabase_database'),
    );
    expect(upScript).toContain('rollout status deployment/postgres --timeout=900s');
    expect(upScript).toContain('rollout status deployment/gateway --timeout=600s');
    const runMigrationsCallIndex = upScript.lastIndexOf('  run_supabase_migrations');
    const reconcileProfileCallIndex = upScript.lastIndexOf('  reconcile_supabase_profile');
    const appRuntimeApplyIndex = upScript.lastIndexOf(
      'kubectl --context "${PROFILE}" apply -k "${K8S_DIR}"',
    );

    expect(upScript.lastIndexOf('  apply_supabase_runtime_workloads')).toBeLessThan(
      upScript.indexOf('rollout status deployment/auth'),
    );
    expect(upScript.indexOf('rollout status deployment/auth')).toBeLessThan(runMigrationsCallIndex);
    expect(upScript.indexOf('rollout status deployment/storage')).toBeLessThan(
      runMigrationsCallIndex,
    );
    expect(upScript.indexOf('  reconcile_supabase_profile')).toBeLessThan(
      upScript.indexOf('  reload_postgrest_schema'),
    );
    expect(upScript.indexOf('rollout status deployment/studio')).toBeLessThan(
      upScript.indexOf('"${PORT_FORWARD_SCRIPT}" start studio'),
    );
    expect(runMigrationsCallIndex).toBeLessThan(reconcileProfileCallIndex);
    expect(reconcileProfileCallIndex).toBeLessThan(appRuntimeApplyIndex);
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
