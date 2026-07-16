import {
  SUPABASE_VAULT_MIGRATION_SQL,
  SUPABASE_VAULT_SECRET_STORE_PROVIDER,
} from '@ankhorage/supabase-vault';

import type { InfraManifestInput } from '../../../../types';
import type { MinikubeAdapterArtifacts } from '../../contracts';

export const SUPABASE_VAULT_MIGRATION_PATH =
  'infra/minikube/supabase/migrations/202607120001_ankhorage_supabase_vault.sql';

export function generateSupabaseVaultSecretStoreArtifacts(args: {
  readonly manifest: InfraManifestInput;
  readonly namespace: string;
}): MinikubeAdapterArtifacts {
  validateOAuthSecretReferences(args.manifest);

  return {
    files: [
      {
        path: SUPABASE_VAULT_MIGRATION_PATH,
        content: `${SUPABASE_VAULT_MIGRATION_SQL.trim()}\n`,
      },
      {
        path: 'infra/minikube/secrets/supabase-vault.md',
        content: getRuntimeGuide(args.namespace),
      },
    ],
    resources: [],
    envEntries: [
      `SECRET_STORE_PROVIDER=${SUPABASE_VAULT_SECRET_STORE_PROVIDER}`,
      'SUPABASE_KUBERNETES_ENABLED=true',
    ],
    warnings: [],
  };
}

function validateOAuthSecretReferences(manifest: InfraManifestInput): void {
  const oauth = manifest.auth?.oauth;
  if (!oauth?.enabled) return;

  const enabledProviders = oauth.providers.filter((provider) => provider.enabled !== false);
  if (enabledProviders.length === 0) {
    throw new Error('OAuth is enabled but no OAuth provider is enabled.');
  }

  for (const provider of enabledProviders) {
    if (!provider.credentialsRef?.trim()) {
      throw new Error(
        `OAuth provider "${provider.id}" is enabled but does not define credentialsRef.`,
      );
    }
  }
}

function getRuntimeGuide(namespace: string): string {
  return `# Supabase Vault secret store

This project selects the provider-neutral secret-store backend through:

\`\`\`text
infra.secretStore.provider = ${SUPABASE_VAULT_SECRET_STORE_PROVIDER}
\`\`\`

The immutable migration at:

\`\`\`text
${SUPABASE_VAULT_MIGRATION_PATH}
\`\`\`

is applied by the Kubernetes-owned Supabase migration lifecycle during \`scripts/up.sh\`
with \`supabase migration up --db-url "$SUPABASE_DB_URL"\`.

## Security boundary

- Secret values are stored only through Supabase Vault.
- Public manifests contain logical references such as \`auth/oauth/google\`, never values.
- Project and environment scope are supplied by trusted server code.
- The browser may receive secret metadata, but must never receive resolved values or Vault IDs.
- Bootstrap database access must come from trusted process environment or workload identity.
- Do not expose service-role keys, provider secrets, or resolved payloads through
  \`NEXT_PUBLIC_*\`, \`EXPO_PUBLIC_*\`, generated YAML, tracked JSON, or app bundles.

## Trusted adapter composition

Use \`createInfraSecretStoreAdapter\` from \`@ankhorage/infra\` in server-only code and pass
a trusted Supabase Vault SQL client. The app manifest chooses the provider; privileged connection
configuration does not belong in the manifest.

Generated Kubernetes namespace: \`${namespace}\`.
`;
}
