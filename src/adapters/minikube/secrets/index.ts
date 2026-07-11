import {
  SUPABASE_VAULT_MIGRATION_ID,
  SUPABASE_VAULT_MIGRATION_SQL,
} from '@ankhorage/supabase-vault/migration';

import type { InfraManifestInput } from '../../../types';
import { emptyMinikubeArtifacts, type MinikubeAdapterArtifacts } from '../contracts';

export const DEFAULT_SUPABASE_SECRET_STORE_PROVIDER = 'supabase-vault' as const;

export function resolveSecretStoreProvider(manifest: InfraManifestInput): string | null {
  const explicitProvider = manifest.secretStore?.provider?.trim();
  if (explicitProvider) return explicitProvider;

  const usesSupabase =
    manifest.auth?.provider === 'supabase' ||
    manifest.database?.provider === 'supabase' ||
    manifest.storage?.provider === 'supabase' ||
    (manifest.storage?.provider === 'auto' &&
      (manifest.auth?.provider === 'supabase' || manifest.database?.provider === 'supabase'));

  return usesSupabase ? DEFAULT_SUPABASE_SECRET_STORE_PROVIDER : null;
}

export function generateSecretStoreArtifacts(args: {
  manifest: InfraManifestInput;
  namespace: string;
}): MinikubeAdapterArtifacts {
  const { manifest, namespace } = args;
  const provider = resolveSecretStoreProvider(manifest);

  if (provider === null) return emptyMinikubeArtifacts();

  if (provider !== DEFAULT_SUPABASE_SECRET_STORE_PROVIDER) {
    throw new Error(
      `Unsupported secret-store provider for minikube adapter: "${provider}". Only "${DEFAULT_SUPABASE_SECRET_STORE_PROVIDER}" is currently implemented.`,
    );
  }

  const usesSupabaseRuntime =
    manifest.auth?.provider === 'supabase' ||
    manifest.database?.provider === 'supabase' ||
    manifest.storage?.provider === 'supabase' ||
    manifest.storage?.provider === 'auto';

  if (!usesSupabaseRuntime) {
    throw new Error(
      'The "supabase-vault" secret store requires the canonical local Supabase stack.',
    );
  }

  const warnings = collectSecretStoreWarnings(manifest);

  return {
    resources: [],
    envEntries: [`SECRET_STORE_PROVIDER=${provider}`],
    warnings,
    files: [
      {
        path: `infra/minikube/supabase/migrations/${SUPABASE_VAULT_MIGRATION_ID}.sql`,
        content: `${SUPABASE_VAULT_MIGRATION_SQL.trim()}\n`,
      },
      {
        path: 'infra/minikube/secrets/README.md',
        content: getSecretStoreReadme({ namespace, provider }),
      },
      {
        path: 'infra/minikube/scripts/check-secret-store.sh',
        content: getSecretStoreCheckScript(),
        executable: true,
      },
    ],
  };
}

function collectSecretStoreWarnings(manifest: InfraManifestInput): string[] {
  const warnings: string[] = [];
  const oauth = manifest.auth?.oauth;

  if (oauth?.enabled && oauth.providers.filter((provider) => provider.enabled !== false).length === 0) {
    warnings.push('OAuth is enabled, but no OAuth providers are enabled.');
  }

  for (const provider of oauth?.providers ?? []) {
    if (provider.enabled === false) continue;
    if (!provider.credentialsRef?.trim()) {
      warnings.push(
        `OAuth provider "${provider.id}" is enabled without a credentialsRef and cannot be materialized.`,
      );
    }
  }

  return warnings;
}

function getSecretStoreReadme(args: { namespace: string; provider: string }): string {
  return `# Generated Secret Store\n\nProvider: \`${args.provider}\`\nNamespace: \`${args.namespace}\`\n\nThe migration in \`../supabase/migrations/${SUPABASE_VAULT_MIGRATION_ID}.sql\` is applied through the normal local Supabase migration lifecycle. Raw values are stored in Supabase Vault; logical project/environment references and non-secret metadata are stored in the protected \`ankh_private\` schema.\n\n## Bootstrap boundary\n\nProvide \`SUPABASE_URL\` and \`SUPABASE_SERVICE_ROLE_KEY\` only to trusted Studio/Infra server processes. Never write the service-role key, OAuth secrets, Vault UUIDs, or resolved payloads into tracked manifests, generated YAML, browser bundles, public environment variables, logs, or snapshots.\n\nRun \`../scripts/check-secret-store.sh\` after the local Supabase stack is available.\n`;
}

function getSecretStoreCheckScript(): string {
  return `#!/usr/bin/env bash\nset -euo pipefail\n\n: "\${SUPABASE_DB_URL:?SUPABASE_DB_URL is required for trusted secret-store diagnostics}"\n\npsql "\$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'\nselect extname from pg_extension where extname = 'supabase_vault';\nselect to_regclass('ankh_private.secret_metadata') as metadata_table;\nselect has_function_privilege('anon', 'public.ankh_secret_resolve(text,text,text)', 'EXECUTE') as anon_can_resolve;\nselect has_function_privilege('authenticated', 'public.ankh_secret_resolve(text,text,text)', 'EXECUTE') as authenticated_can_resolve;\nSQL\n`;
}
