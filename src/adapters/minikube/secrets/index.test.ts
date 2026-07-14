import type { AppManifest } from '@ankhorage/contracts';
import { SUPABASE_VAULT_MIGRATION_SQL } from '@ankhorage/supabase-vault';
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
  test('generates the released Supabase Vault migration through the existing lifecycle', () => {
    const result = generateInfrastructure(createManifest(), {
      appManifest: createAppManifest('vault-app'),
    });
    const migration = result.files.find((file) => file.path === SUPABASE_VAULT_MIGRATION_PATH);
    const envExample = result.files.find((file) => file.path === 'infra/minikube/.env.example');
    const upScript = result.files.find((file) => file.path === 'infra/minikube/scripts/up.sh');

    expect(migration?.content).toBe(`${SUPABASE_VAULT_MIGRATION_SQL.trim()}\n`);
    expect(envExample?.content).toContain('SECRET_STORE_PROVIDER=supabase-vault');
    expect(envExample?.content).toContain('SUPABASE_LOCAL_ENABLED=true');
    expect(upScript?.content).toContain('SUPABASE_LOCAL_ENABLED="${SUPABASE_LOCAL_ENABLED:-true}"');
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
    expect(serialized).not.toContain('clientSecret');
    expect(serialized).not.toContain('privateKey');
  });

  test('rejects unknown secret-store providers', () => {
    expect(() =>
      generateInfrastructure(
        createManifest({
          secretStore: {
            provider: 'aws-secrets-manager',
          },
        }),
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
