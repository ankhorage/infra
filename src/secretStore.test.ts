import type {
  SupabaseVaultQueryResult,
  SupabaseVaultSqlClient,
  SupabaseVaultSqlExecutor,
} from '@ankhorage/supabase-vault';
import { describe, expect, test } from 'bun:test';

import { createInfraSecretStoreAdapter } from './secretStore';

class FakeSupabaseVaultClient implements SupabaseVaultSqlClient {
  query<TRow extends Record<string, unknown>>(): Promise<SupabaseVaultQueryResult<TRow>> {
    return Promise.resolve({ rows: [] });
  }

  transaction<TResult>(
    operation: (executor: SupabaseVaultSqlExecutor) => Promise<TResult>,
  ): Promise<TResult> {
    return operation(this);
  }
}

describe('createInfraSecretStoreAdapter', () => {
  test('returns null when the manifest does not select a secret store', () => {
    expect(
      createInfraSecretStoreAdapter({
        manifest: {},
        providers: {},
      }),
    ).toBeNull();
  });

  test('creates the released Supabase Vault adapter from trusted options', () => {
    const adapter = createInfraSecretStoreAdapter({
      manifest: {
        secretStore: {
          provider: 'supabase-vault',
        },
      },
      providers: {
        supabaseVault: {
          client: new FakeSupabaseVaultClient(),
        },
      },
    });

    expect(adapter).not.toBeNull();
    expect(typeof adapter?.list).toBe('function');
    expect(typeof adapter?.resolve).toBe('function');
  });

  test('requires trusted provider bootstrap options', () => {
    expect(() =>
      createInfraSecretStoreAdapter({
        manifest: {
          secretStore: {
            provider: 'supabase-vault',
          },
        },
        providers: {},
      }),
    ).toThrow('requires trusted Supabase Vault adapter options');
  });

  test('rejects unknown providers instead of silently falling back', () => {
    expect(() =>
      createInfraSecretStoreAdapter({
        manifest: {
          secretStore: {
            provider: 'aws-secrets-manager',
          },
        },
        providers: {},
      }),
    ).toThrow('Unsupported secret-store provider');
  });
});
