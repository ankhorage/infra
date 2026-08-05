import { getLocalAuthRedirectPatterns, normalizeAuthCallbackRoute } from '../../../authRedirects';
import type { InfraManifestInput } from '../../../types';
import type { MinikubeAdapterArtifacts, MinikubeProviderLifecycle } from '../contracts';

interface SupabaseOAuthRuntimeModel {
  callbackRoute: string;
  envPrefixes: readonly string[];
  localRedirectPatterns: readonly string[];
}

export function generateSupabaseOAuthRuntimeArtifacts(
  manifest: InfraManifestInput,
): MinikubeAdapterArtifacts {
  const oauthRuntime = resolveOAuthRuntimeModel(manifest);
  if (!oauthRuntime) {
    return {
      files: [],
      resources: [],
      providerLifecycle: [],
      envEntries: [],
      warnings: [],
    };
  }

  return {
    files: [
      {
        path: 'infra/minikube/auth/oauth-runtime.md',
        content: getOAuthRuntimeGuide(oauthRuntime),
      },
    ],
    resources: [],
    providerLifecycle: [getOAuthProviderLifecycle(oauthRuntime)],
    envEntries: [],
    warnings: [],
  };
}

function resolveOAuthRuntimeModel(manifest: InfraManifestInput): SupabaseOAuthRuntimeModel | null {
  const oauth = manifest.auth?.oauth;
  if (!oauth?.enabled) return null;

  const providers = oauth.providers.filter((provider) => provider.enabled !== false);
  if (providers.length === 0) return null;

  const callbackRoute = normalizeAuthCallbackRoute(oauth.callbackRoute);
  const envPrefixes = providers.map((provider) => {
    const prefix = provider.id
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/gu, '_')
      .replace(/^_+|_+$/gu, '');
    if (!prefix) {
      throw new Error(
        `OAuth provider "${provider.id}" cannot be mapped to GoTrue environment keys.`,
      );
    }
    return prefix;
  });

  return {
    callbackRoute,
    envPrefixes,
    localRedirectPatterns: getLocalAuthRedirectPatterns(callbackRoute),
  };
}

function getOAuthProviderLifecycle(
  oauthRuntime: SupabaseOAuthRuntimeModel,
): MinikubeProviderLifecycle {
  return {
    id: 'supabase-auth',
    namespace: 'supabase',
    endpoints: [],
    readinessChecks: [
      {
        label: 'GoTrue',
        namespace: 'supabase',
        resource: 'deployment/auth',
        timeoutSeconds: 600,
      },
    ],
    migrationCommands: [],
    reconciliationCommands: [
      {
        label: 'OAuth redirect and runtime rollout reconciliation',
        command: getOAuthRuntimeReconciliationCommand(oauthRuntime),
      },
    ],
    statusChecks: [
      {
        label: 'OAuth redirect configuration',
        command: getOAuthRuntimeStatusCommand(oauthRuntime),
      },
    ],
  };
}

function getOAuthRuntimeReconciliationCommand(oauthRuntime: SupabaseOAuthRuntimeModel): string {
  const localPatterns = oauthRuntime.localRedirectPatterns.join(',');
  const providerRedirectAssignments = oauthRuntime.envPrefixes
    .map((prefix) => `GOTRUE_EXTERNAL_${prefix}_REDIRECT_URI="\${oauth_provider_callback}"`)
    .join(' ');
  const providerExports = oauthRuntime.envPrefixes
    .map(
      (prefix) => `export GOTRUE_EXTERNAL_${prefix}_REDIRECT_URI="\${oauth_provider_callback}"
write_env_value GOTRUE_EXTERNAL_${prefix}_REDIRECT_URI "\${oauth_provider_callback}"`,
    )
    .join('\n');

  return `oauth_callback_route='${oauthRuntime.callbackRoute}'
oauth_callback_path="\${oauth_callback_route#/}"
oauth_site_url="\${SITE_URL%/}"
oauth_provider_callback="\${API_EXTERNAL_URL%/}/callback"
oauth_redirect_allow_list="\${oauth_site_url},\${oauth_site_url}/\${oauth_callback_path},${localPatterns}"
if [[ -n "\${OAUTH_NATIVE_REDIRECT_URLS:-}" ]]; then
  oauth_redirect_allow_list="\${oauth_redirect_allow_list},\${OAUTH_NATIVE_REDIRECT_URLS}"
fi
export ADDITIONAL_REDIRECT_URLS="\${oauth_redirect_allow_list}"
write_env_value ADDITIONAL_REDIRECT_URLS "\${oauth_redirect_allow_list}"
${providerExports}
kubectl --context "\${PROFILE}" -n supabase set env deployment/auth \\
  API_EXTERNAL_URL="\${API_EXTERNAL_URL}" \\
  GOTRUE_SITE_URL="\${SITE_URL}" \\
  GOTRUE_URI_ALLOW_LIST="\${oauth_redirect_allow_list}" \\
  GOTRUE_JWT_ISSUER="\${API_EXTERNAL_URL}" \\
  ${providerRedirectAssignments} >/dev/null
kubectl --context "\${PROFILE}" -n supabase rollout restart deployment/auth >/dev/null
kubectl --context "\${PROFILE}" -n supabase rollout status deployment/auth --timeout=600s`;
}

function getOAuthRuntimeStatusCommand(oauthRuntime: SupabaseOAuthRuntimeModel): string {
  return `oauth_callback_route='${oauthRuntime.callbackRoute}'
oauth_callback_path="\${oauth_callback_route#/}"
if [[ -n "\${API_EXTERNAL_URL:-}" ]]; then
  echo "- provider supabase-auth/provider-callback: \${API_EXTERNAL_URL%/}/callback"
else
  echo "- provider supabase-auth/provider-callback: unavailable"
fi
if [[ -n "\${SITE_URL:-}" ]]; then
  echo "- provider supabase-auth/app-callback: \${SITE_URL%/}/\${oauth_callback_path}"
else
  echo "- provider supabase-auth/app-callback: unavailable"
fi
echo "- provider supabase-auth/local-callback-patterns: ${oauthRuntime.localRedirectPatterns.join(',')}"`;
}

function getOAuthRuntimeGuide(oauthRuntime: SupabaseOAuthRuntimeModel): string {
  const localPatterns = oauthRuntime.localRedirectPatterns
    .map((pattern) => `- \`${pattern}\``)
    .join('\n');

  return `# Supabase OAuth Runtime Reconciliation

The provider callback is derived from the active project gateway as
\`\${API_EXTERNAL_URL%/}/callback\`, which resolves to the project-owned
\`/auth/v1/callback\` endpoint. GoTrue-to-app redirects use the configured callback route
\`${oauthRuntime.callbackRoute}\`.

Local Minikube reconciliation adds only callback-scoped loopback patterns:

${localPatterns}

Native callback URIs may be supplied through \`OAUTH_NATIVE_REDIRECT_URLS\`. The generated
provider lifecycle writes only redirect metadata, never OAuth client secrets. It updates the
GoTrue deployment environment, forces \`deployment/auth\` to restart, and waits up to 600
seconds for the rollout. A failed rollout stops Infra Up before its success message.
`;
}
