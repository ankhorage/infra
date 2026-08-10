import type { InfraManifest } from '@ankhorage/contracts';
import { describe, expect, test } from 'bun:test';

import { generateInfrastructure } from '../../../../index';
import { createAppManifest } from '../../../../testSupport';
import { generateSupabaseOAuthRuntimeArtifacts } from '../oauthRuntime';

describe('Supabase OAuth runtime reconciliation', () => {
  test('contributes callback-scoped local redirects and a bounded GoTrue restart', () => {
    const artifacts = generateSupabaseOAuthRuntimeArtifacts(createOAuthManifest());
    const [lifecycle] = artifacts.providerLifecycle;
    const command = lifecycle?.reconciliationCommands[0]?.command ?? '';
    const statusCommand = lifecycle?.statusChecks[0]?.command ?? '';
    const guide = getFile(artifacts.files, 'infra/minikube/auth/oauth-runtime.md');

    expect(lifecycle?.id).toBe('supabase-auth');
    expect(lifecycle?.namespace).toBe('supabase');
    expect(lifecycle?.readinessChecks).toEqual([
      {
        label: 'GoTrue',
        namespace: 'supabase',
        resource: 'deployment/auth',
        timeoutSeconds: 600,
      },
    ]);
    expect(command).toContain('oauth_provider_callback="${API_EXTERNAL_URL%/}/callback"');
    expect(command).toContain('http://127.0.0.1:*/auth/callback');
    expect(command).toContain('http://localhost:*/auth/callback');
    expect(command).toContain('OAUTH_NATIVE_REDIRECT_URLS');
    expect(command).toContain('GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI="${oauth_provider_callback}"');
    expect(command).toContain('sync_supabase_secrets');
    expect(command).not.toContain('set env deployment/auth');
    expect(command).toContain('rollout restart deployment/auth');
    expect(command).toContain('rollout status deployment/auth --timeout=600s');
    expect(command.indexOf('sync_supabase_secrets')).toBeLessThan(
      command.indexOf('rollout restart deployment/auth'),
    );
    expect(command.indexOf('rollout restart deployment/auth')).toBeLessThan(
      command.indexOf('rollout status deployment/auth'),
    );
    expect(command).not.toContain('clientSecret');
    expect(command).not.toContain('GOTRUE_EXTERNAL_GOOGLE_SECRET=');
    expect(statusCommand).toContain('provider supabase-auth/provider-callback');
    expect(statusCommand).toContain('provider supabase-auth/app-callback');
    expect(guide).toContain('Supabase OAuth Runtime Reconciliation');
    expect(guide).toContain('re-syncs the canonical Supabase runtime');
    expect(guide).toContain('A failed rollout stops Infra Up before its success message.');
  });

  test('keeps Auth deployment environment declarative across reconciliation', () => {
    const result = generateInfrastructure(createOAuthManifest(), {
      appManifest: createAppManifest('oauth-app'),
    });
    const upScript = getFile(result.files, 'infra/minikube/scripts/up.sh');
    const authManifest = getFile(result.files, 'infra/minikube/k8s/supabase/auth.yaml');
    const kustomization = getFile(result.files, 'infra/minikube/k8s/kustomization.yaml');
    const statusScript = getFile(result.files, 'infra/minikube/scripts/status.sh');

    expect(kustomization.match(/namespaces\/supabase\.yaml/gu)).toHaveLength(1);
    expect(upScript).toContain(
      'Running provider supabase-auth OAuth redirect and runtime rollout reconciliation.',
    );
    expect(upScript).not.toContain(
      'kubectl --context "${PROFILE}" -n supabase set env deployment/auth',
    );
    expect(upScript).toContain('sync_supabase_secrets');
    expect(upScript).toContain(
      'kubectl --context "${PROFILE}" -n supabase rollout restart deployment/auth',
    );
    expect(upScript).toContain(
      'kubectl --context "${PROFILE}" -n supabase rollout status deployment/auth --timeout=600s',
    );
    expect(authManifest).toContain('name: API_EXTERNAL_URL\n              valueFrom:');
    expect(authManifest).toContain('name: GOTRUE_SITE_URL\n              valueFrom:');
    expect(authManifest).toContain('name: GOTRUE_URI_ALLOW_LIST\n              valueFrom:');
    expect(authManifest).toContain('name: GOTRUE_JWT_ISSUER\n              valueFrom:');
    expect(upScript.lastIndexOf('run_provider_reconciliation')).toBeLessThan(
      upScript.lastIndexOf('echo "Minikube infrastructure for \'${PROFILE}\' is running."'),
    );
    expect(upScript.indexOf('credentialsRef auth/oauth/google')).toBeLessThan(
      upScript.lastIndexOf('run_provider_reconciliation'),
    );
    expect(statusScript).toContain('provider supabase-auth/local-callback-patterns');
  });

  test('keeps canonical port groups distinct for concurrent projects', () => {
    const first = generateInfrastructure(createOAuthManifest(), {
      appManifest: createAppManifest('oauth-one'),
    });
    const second = generateInfrastructure(createOAuthManifest(), {
      appManifest: createAppManifest('oauth-two'),
    });

    const firstEnv = getFile(first.files, 'infra/minikube/.env.example');
    const secondEnv = getFile(second.files, 'infra/minikube/.env.example');
    const firstGatewayPort = readEnvValue(firstEnv, 'SUPABASE_GATEWAY_FORWARD_LOCAL_PORT');
    const secondGatewayPort = readEnvValue(secondEnv, 'SUPABASE_GATEWAY_FORWARD_LOCAL_PORT');
    const firstAppPort = readEnvValue(firstEnv, 'APP_PORT_FORWARD_LOCAL_PORT');
    const secondAppPort = readEnvValue(secondEnv, 'APP_PORT_FORWARD_LOCAL_PORT');

    expect(firstGatewayPort).not.toBe(secondGatewayPort);
    expect(firstAppPort).not.toBe(secondAppPort);
    expect(`http://127.0.0.1:${firstGatewayPort}/auth/v1/callback`).not.toBe(
      `http://127.0.0.1:${secondGatewayPort}/auth/v1/callback`,
    );
  });
});

function createOAuthManifest(): InfraManifest {
  return {
    deployment: {
      target: 'minikube',
      monitoring: false,
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
    database: {
      provider: 'supabase',
      tier: 'dev',
    },
    secretStore: {
      provider: 'supabase-vault',
    },
    plugins: [],
  };
}

function getFile(files: readonly { path: string; content: string }[], path: string): string {
  const file = files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`Missing generated file: ${path}`);
  return file.content;
}

function readEnvValue(content: string, key: string): string {
  const line = content.split('\n').find((candidate) => candidate.startsWith(`${key}=`));
  if (!line) throw new Error(`Missing generated env key: ${key}`);
  return line.slice(key.length + 1);
}
