import type { InfraManifest } from '@ankhorage/contracts';
import { describe, expect, test } from 'bun:test';

import { createAppManifest } from '../../../testSupport';
import { generateTargetAwareSupabaseOAuthRuntimeArtifacts } from './targetAwareOAuthRuntime';

describe('target-aware Supabase OAuth runtime', () => {
  test('removes the legacy native redirect environment source', () => {
    const artifacts = generateTargetAwareSupabaseOAuthRuntimeArtifacts({
      appManifest: undefined,
      manifest: createOAuthManifest(),
    });
    const [lifecycle] = artifacts.providerLifecycle;
    const command = lifecycle?.reconciliationCommands[0]?.command ?? '';

    expect(command).toContain('http://127.0.0.1:*/auth/callback');
    expect(command).toContain('http://localhost:*/auth/callback');
    expect(command).not.toContain('OAUTH_NATIVE_REDIRECT_URLS');
    expect(artifacts.warnings).toEqual([
      'OAuth deploy.targets is missing; Infra keeps Web-local redirects only until canonical targets are persisted.',
    ]);
  });

  test('emits only the enabled native callback for a native-only app', () => {
    const appManifest = {
      ...createAppManifest('native-oauth'),
      deploy: {
        targets: {
          web: { enabled: false },
          android: {
            enabled: true,
            package: 'com.ankh.native',
            scheme: 'ankh-native',
          },
          ios: {
            enabled: false,
            bundleIdentifier: 'com.ankh.native',
          },
        },
      },
    };
    const artifacts = generateTargetAwareSupabaseOAuthRuntimeArtifacts({
      appManifest,
      manifest: createOAuthManifest(),
    });
    const [lifecycle] = artifacts.providerLifecycle;
    const command = lifecycle?.reconciliationCommands[0]?.command ?? '';
    const status = lifecycle?.statusChecks[0]?.command ?? '';

    expect(command).toContain("oauth_redirect_allow_list='ankh-native://auth/callback'");
    expect(command).not.toContain('oauth_site_url');
    expect(command).not.toContain('localhost:*');
    expect(command).not.toContain('127.0.0.1:*');
    expect(command).not.toContain('OAUTH_NATIVE_REDIRECT_URLS');
    expect(status).toContain('app-callback: disabled (web target)');
    expect(status).toContain('native-callbacks: ankh-native://auth/callback');
    expect(artifacts.warnings).toEqual([]);
  });
});

function createOAuthManifest(): InfraManifest {
  return {
    deployment: { target: 'minikube', monitoring: false },
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
    database: { provider: 'supabase', tier: 'dev' },
    secretStore: { provider: 'supabase-vault' },
    modules: [],
  };
}
