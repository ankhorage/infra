import type { AuthOAuthConfig } from '@ankhorage/contracts/auth';
import type {
  SecretMetadata,
  SecretScope,
  SecretStoreAdapter,
  SecretStoreResult,
} from '@ankhorage/contracts/secrets';
import {
  getSupabaseOAuthProviderDefinition,
  materializeSupabaseOAuthEnvironment,
} from '@ankhorage/supabase-auth';

export interface ResolvedOAuthProviderStatus {
  provider: string;
  credentialsRef: string;
  configuredFields: readonly string[];
}

export interface SupabaseOAuthRuntimeEnvironment {
  environment: Readonly<Record<string, string>>;
  providers: readonly ResolvedOAuthProviderStatus[];
}

/**
 * Resolves OAuth credentials only inside trusted Studio/Infra server code.
 *
 * The returned environment contains raw values and must be passed directly to
 * the Supabase Auth workload. It must never be serialized into generated files,
 * browser responses, logs, snapshots, or public environment variables.
 */
export async function resolveSupabaseOAuthRuntimeEnvironment(input: {
  secretStore: SecretStoreAdapter;
  scope: SecretScope;
  oauth: AuthOAuthConfig;
  providerCallbackUri: string;
}): Promise<SecretStoreResult<SupabaseOAuthRuntimeEnvironment>> {
  const providerCallbackUri = input.providerCallbackUri.trim();
  if (providerCallbackUri.length === 0) {
    return {
      ok: false,
      error: {
        code: 'invalid_config',
        message: 'Supabase OAuth materialization requires a provider callback URI.',
      },
    };
  }

  const environment: Record<string, string> = {};
  const providers: ResolvedOAuthProviderStatus[] = [];

  for (const providerConfig of input.oauth.providers) {
    const definition = getSupabaseOAuthProviderDefinition(providerConfig.id);
    if (definition === null) {
      return {
        ok: false,
        error: {
          code: 'invalid_config',
          message: `Supabase OAuth provider "${providerConfig.id}" is not supported by the current provider registry.`,
        },
      };
    }

    if (providerConfig.enabled === false) {
      environment[definition.runtimeEnvironment.enabled] = 'false';
      continue;
    }

    const credentialsRef = providerConfig.credentialsRef?.trim() ?? '';
    if (credentialsRef.length === 0) {
      return {
        ok: false,
        error: {
          code: 'invalid_reference',
          message: `Enabled OAuth provider "${providerConfig.id}" requires a credentialsRef.`,
        },
      };
    }

    const metadataResult = await input.secretStore.getMetadata({
      scope: input.scope,
      ref: credentialsRef,
    });
    if (!metadataResult.ok) return metadataResult;

    const completenessError = validateConfiguredFields(
      providerConfig.id,
      metadataResult.data,
      definition.secretFields.map((field) => field.name),
    );
    if (completenessError !== null) return completenessError;

    const payloadResult = await input.secretStore.resolve({
      scope: input.scope,
      ref: credentialsRef,
    });
    if (!payloadResult.ok) return payloadResult;

    const materialized = materializeSupabaseOAuthEnvironment({
      provider: providerConfig.id,
      payload: payloadResult.data,
      redirectUri: providerCallbackUri,
    });
    if (!materialized.ok) return materialized;

    Object.assign(environment, materialized.data);
    providers.push({
      provider: providerConfig.id,
      credentialsRef,
      configuredFields: metadataResult.data.configuredFields,
    });
  }

  if (input.oauth.enabled && providers.length === 0) {
    return {
      ok: false,
      error: {
        code: 'invalid_config',
        message: 'OAuth is enabled, but no enabled provider credentials were materialized.',
      },
    };
  }

  return {
    ok: true,
    data: {
      environment,
      providers,
    },
  };
}

function validateConfiguredFields(
  provider: string,
  metadata: SecretMetadata,
  requiredFields: readonly string[],
): SecretStoreResult<never> | null {
  const configured = new Set(metadata.configuredFields);
  const missing = requiredFields.filter((field) => !configured.has(field));

  if (missing.length === 0) return null;

  return {
    ok: false,
    error: {
      code: 'invalid_payload',
      message: `OAuth credentials for "${provider}" are incomplete; missing fields: ${missing.join(', ')}.`,
    },
  };
}
