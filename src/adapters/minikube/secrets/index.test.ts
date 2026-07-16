import type { AppManifest } from '@ankhorage/contracts';
import { describe, expect, test } from 'bun:test';

import { generateInfrastructure } from '../../../index';
import type { InfraManifestInput } from '../../../types';
import { SUPABASE_VAULT_MIGRATION_PATH } from './supabase-vault';

function createManifest(overrides: Partial<InfraManifestInput> = {}): InfraManifestInput {
  return {
    deployment: {
      target: 'minikube',
      monitoring: false,
    },
    secretStore: {
      provider: 'supabase-vault',
    },
    plugins: [],
    ...overrides,
  };
}

describe('minikube secret-store generation', () => {
  test('generates the released Supabase Vault migration through the Kubernetes lifecycle', () => {
    const result = generateInfrastructure(createManifest(), {
      appManifest: createAppManifest('vault-app'),
    });
    const migration = result.files.find((file) => file.path === SUPABASE_VAULT_MIGRATION_PATH);
    const envExample = result.files.find((file) => file.path === 'infra/minikube/.env.example');
    const upScript = result.files.find((file) => file.path === 'infra/minikube/scripts/up.sh');

    expect(migration?.content).toContain('create schema if not exists vault;');
    expect(migration?.content).toContain(
      'create extension if not exists supabase_vault with schema vault;',
    );
    expect(migration?.content).toContain('when insufficient_privilege then');
    expect(migration?.content).toContain('create or replace function vault.create_secret');
    expect(migration?.content).toContain('create or replace view vault.decrypted_secrets');
    expect(migration?.content).not.toContain('supabase_vault with schema extensions');
    expect(envExample?.content).toContain('SECRET_STORE_PROVIDER=supabase-vault');
    expect(envExample?.content).not.toContain('SUPABASE_RUNTIME_ENABLED=');
    expect(upScript?.content).toContain('SUPABASE_RUNTIME_ENABLED="true"');
    expect(upScript?.content).not.toContain('SUPABASE_RUNTIME_ENABLED="${SUPABASE_RUNTIME_ENABLED');
    expect(result.meta.providers).toContain('supabase-vault');
  });

  test('requires credentialsRef for every enabled OAuth provider', () => {
    expect(() =>
      generateInfrastructure(
        createManifest({
          auth: {
            scope: 'global',
            provider: 'supabase',
            signIn: {
              identifiers: ['email'],
            },
            oauth: {
              enabled: true,
              callbackRoute: '/auth/callback',
              providers: [
                {
                  id: 'google',
                  enabled: true,
                },
              ],
            },
          },
        }),
        { appManifest: createAppManifest('vault-app') },
      ),
    ).toThrow('does not define credentialsRef');
  });

  test('accepts provider-neutral OAuth secret references without serializing values', () => {
    const result = generateInfrastructure(
      createManifest({
        auth: {
          scope: 'global',
          provider: 'supabase',
          signIn: {
            identifiers: ['email'],
          },
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
      }),
      { appManifest: createAppManifest('vault-app') },
    );

    const serialized = JSON.stringify(result.files);
    expect(serialized).toContain('auth/oauth/google');
    expect(serialized).not.toContain('sentinel-client-secret-value');
    expect(serialized).not.toContain('sentinel-private-key-value');
  });

  test('rejects unknown secret-store providers', () => {
    expect(() =>
      generateInfrastructure(
        createManifest({
          secretStore: {
            provider: 'aws-secrets-manager',
          },
        }),
        { appManifest: createAppManifest('vault-app') },
      ),
    ).toThrow('Unsupported secret-store provider for minikube adapter');
  });
});

function createAppManifest(
  slug: string,
): Pick<AppManifest, 'metadata' | 'navigator' | 'screens' | 'settings'> {
  return {
    metadata: {
      name: slug,
      slug,
      version: '1.0.0',
      themeId: 'default',
    },
    navigator: {
      type: 'stack',
      routes: [],
    },
    screens: {},
    settings: {
      localization: {
        defaultLocale: 'en',
        locales: ['en'],
      },
      authFlow: {
        signInRoute: '/sign-in',
        signUpRoute: '/sign-up',
        signOutRoute: '/sign-out',
        unauthorizedRoute: '/sign-in',
        postSignInRoute: '/',
      },
    },
  };
}
