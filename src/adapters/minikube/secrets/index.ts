import { SUPABASE_VAULT_SECRET_STORE_PROVIDER } from '@ankhorage/supabase-vault';

import type { InfraManifestInput } from '../../../types';
import { emptyMinikubeArtifacts, type MinikubeAdapterArtifacts } from '../contracts';
import { generateSupabaseVaultSecretStoreArtifacts } from './supabase-vault';

export function generateSecretStoreArtifacts(args: {
  readonly manifest: InfraManifestInput;
  readonly namespace: string;
}): MinikubeAdapterArtifacts {
  const provider = args.manifest.secretStore?.provider;
  if (!provider) return emptyMinikubeArtifacts();

  if (provider === SUPABASE_VAULT_SECRET_STORE_PROVIDER) {
    return generateSupabaseVaultSecretStoreArtifacts(args);
  }

  throw new Error(`Unsupported secret-store provider for minikube adapter: "${provider}".`);
}
