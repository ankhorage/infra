import type { SecretStoreAdapter } from '@ankhorage/contracts/secrets';
import {
  createSupabaseVaultAdapter,
  SUPABASE_VAULT_SECRET_STORE_PROVIDER,
  type SupabaseVaultAdapterOptions,
} from '@ankhorage/supabase-vault';

import type { InfraManifestInput } from './types';

export interface InfraSecretStoreProviders {
  readonly supabaseVault?: SupabaseVaultAdapterOptions;
}

export interface CreateInfraSecretStoreAdapterInput {
  readonly manifest: Pick<InfraManifestInput, 'secretStore'>;
  readonly providers: InfraSecretStoreProviders;
}

/**
 * Creates the configured server-only secret-store adapter.
 *
 * Bootstrap credentials and trusted clients belong in `providers`; they must never be read from
 * the public app manifest. A missing `infra.secretStore` returns `null` because apps without
 * secret-backed features do not require a secret store.
 */
export function createInfraSecretStoreAdapter(
  input: CreateInfraSecretStoreAdapterInput,
): SecretStoreAdapter | null {
  const provider = input.manifest.secretStore?.provider;
  if (!provider) return null;

  if (provider === SUPABASE_VAULT_SECRET_STORE_PROVIDER) {
    const options = input.providers.supabaseVault;
    if (!options) {
      throw new Error(
        'Secret-store provider "supabase-vault" requires trusted Supabase Vault adapter options.',
      );
    }

    return createSupabaseVaultAdapter(options);
  }

  throw new Error(`Unsupported secret-store provider: "${provider}".`);
}
