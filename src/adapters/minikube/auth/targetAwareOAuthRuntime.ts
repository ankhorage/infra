import { getLocalAuthRedirectPatterns, normalizeAuthCallbackRoute } from '../../../authRedirects';
import { resolveAuthTargetRedirectModel } from '../../../authTargetRedirects';
import type { InfraManifestInput, InfrastructureGenerationOptions } from '../../../types';
import type { MinikubeAdapterArtifacts, MinikubeProviderLifecycle } from '../contracts';
import { generateSupabaseOAuthRuntimeArtifacts } from './oauthRuntime';

interface RedirectPolicy {
  readonly callbackRoute: string;
  readonly localPatterns: readonly string[];
  readonly nativeRedirectUris: readonly string[];
  readonly webEnabled: boolean;
}

export function generateTargetAwareSupabaseOAuthRuntimeArtifacts(args: {
  readonly appManifest: InfrastructureGenerationOptions['appManifest'];
  readonly manifest: InfraManifestInput;
}): MinikubeAdapterArtifacts {
  const baseArtifacts = generateSupabaseOAuthRuntimeArtifacts(args.manifest);
  if (!baseArtifacts.providerLifecycle.some((lifecycle) => lifecycle.id === 'supabase-auth')) {
    return baseArtifacts;
  }

  const callbackRoute = normalizeAuthCallbackRoute(args.manifest.auth?.oauth?.callbackRoute ?? '');
  const targets = resolveAuthTargetRedirectModel({
    callbackRoute,
    targets: args.appManifest?.deploy?.targets,
  });
  const policy: RedirectPolicy = {
    callbackRoute,
    localPatterns: targets.webEnabled ? getLocalAuthRedirectPatterns(callbackRoute) : [],
    nativeRedirectUris: targets.nativeRedirectUris,
    webEnabled: targets.webEnabled,
  };

  return {
    ...baseArtifacts,
    files: baseArtifacts.files.map((file) =>
      file.path === 'infra/minikube/auth/oauth-runtime.md'
        ? { ...file, content: getTargetAwareGuide(policy) }
        : file,
    ),
    providerLifecycle: baseArtifacts.providerLifecycle.map((lifecycle) =>
      lifecycle.id === 'supabase-auth' ? applyRedirectPolicy(lifecycle, policy) : lifecycle,
    ),
    warnings: [...baseArtifacts.warnings, ...targets.warnings],
  };
}

function applyRedirectPolicy(
  lifecycle: MinikubeProviderLifecycle,
  policy: RedirectPolicy,
): MinikubeProviderLifecycle {
  return {
    ...lifecycle,
    reconciliationCommands: lifecycle.reconciliationCommands.map((entry) => ({
      ...entry,
      command: rewriteReconciliationCommand(entry.command, policy),
    })),
    statusChecks: lifecycle.statusChecks.map((entry) => ({
      ...entry,
      command: getTargetAwareStatusCommand(policy),
    })),
  };
}

function rewriteReconciliationCommand(command: string, policy: RedirectPolicy): string {
  const legacyPatterns = getLocalAuthRedirectPatterns(policy.callbackRoute).join(',');
  const legacyPolicy = `oauth_redirect_allow_list="\${oauth_site_url},\${oauth_site_url}/\${oauth_callback_path},${legacyPatterns}"
if [[ -n "\${OAUTH_NATIVE_REDIRECT_URLS:-}" ]]; then
  oauth_redirect_allow_list="\${oauth_redirect_allow_list},\${OAUTH_NATIVE_REDIRECT_URLS}"
fi`;
  const staticRedirects = [...policy.localPatterns, ...policy.nativeRedirectUris].join(',');
  const suffix = staticRedirects ? `,${staticRedirects}` : '';
  const canonicalPolicy = policy.webEnabled
    ? `oauth_redirect_allow_list="\${oauth_site_url},\${oauth_site_url}/\${oauth_callback_path}${suffix}"`
    : `oauth_redirect_allow_list='${staticRedirects}'`;
  let rewritten = replaceOnce(command, legacyPolicy, canonicalPolicy);

  if (!policy.webEnabled) {
    rewritten = replaceOnce(rewritten, 'oauth_site_url="${SITE_URL%/}"\n', '');
  }

  return rewritten;
}

function getTargetAwareStatusCommand(policy: RedirectPolicy): string {
  const appCallback = policy.webEnabled
    ? `if [[ -n "\${SITE_URL:-}" ]]; then
  echo "- provider supabase-auth/app-callback: \${SITE_URL%/}/\${oauth_callback_path}"
else
  echo "- provider supabase-auth/app-callback: unavailable"
fi`
    : 'echo "- provider supabase-auth/app-callback: disabled (web target)"';
  const localPatterns = policy.localPatterns.join(',') || 'none';
  const nativeRedirects = policy.nativeRedirectUris.join(',') || 'none';

  return `oauth_callback_route='${policy.callbackRoute}'
oauth_callback_path="\${oauth_callback_route#/}"
if [[ -n "\${API_EXTERNAL_URL:-}" ]]; then
  echo "- provider supabase-auth/provider-callback: \${API_EXTERNAL_URL%/}/callback"
else
  echo "- provider supabase-auth/provider-callback: unavailable"
fi
${appCallback}
echo "- provider supabase-auth/local-callback-patterns: ${localPatterns}"
echo "- provider supabase-auth/native-callbacks: ${nativeRedirects}"`;
}

function getTargetAwareGuide(policy: RedirectPolicy): string {
  const nativeRedirects = policy.nativeRedirectUris.length
    ? policy.nativeRedirectUris.map((uri) => `- \`${uri}\``).join('\n')
    : '- none';

  return `# Supabase OAuth Runtime Reconciliation

The provider callback remains project-owned. GoTrue-to-app redirects use the configured callback
route \`${policy.callbackRoute}\` and are derived from \`AppManifest.deploy.targets\`.

- Web target: ${policy.webEnabled ? 'enabled' : 'disabled'}
- Native callbacks:
${nativeRedirects}

Local loopback patterns are emitted only for an enabled Web target. Native callbacks come only
from enabled Android/iOS target schemes; no environment variable or slug-derived identity can add
a native callback. Provider credential values remain sourced from trusted secret resolution.
`;
}

function replaceOnce(value: string, search: string, replacement: string): string {
  if (!value.includes(search)) {
    throw new Error(
      'Supabase OAuth redirect reconciliation template drifted from its canonical form.',
    );
  }
  return value.replace(search, replacement);
}
