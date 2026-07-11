import { describe, expect, test } from 'bun:test';

import type { InfraManifestInput } from '../../../types';
import {
  DEFAULT_SUPABASE_SECRET_STORE_PROVIDER,
  generateSecretStoreArtifacts,
  resolveSecretStoreProvider,
} from './index';

function createManifest(overrides: Partial<InfraManifestInput> = {}): InfraManifestInput {
  return {
    deployment: { target: 'minikube', monitoring: false },
    database: { provider: 'supabase', tier: 'dev' },
    plugins: [],
    ...overrides,
  };
}

describe('Supabase Vault infra generation', () => {
  test('uses one canonical default for the Supabase stack', () => {
    const manifest = createManifest();
    expect(resolveSecretStoreProvider(manifest)).toBe(DEFAULT_SUPABASE_SECRET_STORE_PROVIDER);

    const artifacts = generateSecretStoreArtifacts({ manifest, namespace: 'scanner' });
    expect(artifacts.envEntries).toContain('SECRET_STORE_PROVIDER=supabase-vault');
    expect(
      artifacts.files.some((file) =>
        file.path.startsWith('infra/minikube/supabase/migrations/20260711_001_ankh_secret_store'),
      ),
    ).toBe(true);
  });

  test('honors explicit canonical provider selection', () => {
    const manifest = createManifest({
      secretStore: { provider: 'supabase-vault' },
    });

    expect(resolveSecretStoreProvider(manifest)).toBe('supabase-vault');
  });

  test('rejects unsupported providers without falling back', () => {
    const manifest = createManifest({
      secretStore: { provider: 'aws-secrets-manager' },
    });

    expect(() => generateSecretStoreArtifacts({ manifest, namespace: 'scanner' })).toThrow(
      'Unsupported secret-store provider',
    );
  });

  test('warns when enabled OAuth providers cannot resolve credentials', () => {
    const manifest = createManifest({
      auth: {
        scope: 'global',
        provider: 'supabase',
        oauth: {
          enabled: true,
          callbackRoute: '/auth/callback',
          providers: [{ id: 'google', enabled: true }],
        },
      },
    });

    const artifacts = generateSecretStoreArtifacts({ manifest, namespace: 'scanner' });
    expect(artifacts.warnings).toEqual([
      'OAuth provider "google" is enabled without a credentialsRef and cannot be materialized.',
    ]);
  });

  test('never emits submitted secret values or public secret variables', () => {
    const manifest = createManifest({
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
    });

    const serialized = JSON.stringify(
      generateSecretStoreArtifacts({ manifest, namespace: 'scanner' }),
    );
    expect(serialized).not.toContain('clientSecret');
    expect(serialized).not.toContain('NEXT_PUBLIC_');
    expect(serialized).not.toContain('EXPO_PUBLIC_');
  });
});
