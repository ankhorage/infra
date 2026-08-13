import type { InfrastructureGenerationOptions, InfraManifestInput } from '../../../types';
import { emptyMinikubeArtifacts, type MinikubeAdapterArtifacts } from '../contracts';
import { generateSupabaseOAuthRuntimeArtifacts } from './oauthRuntime';
import { generateSupabaseAuthArtifacts } from './supabase';

export function generateAuthProviderArtifacts(args: {
  appManifest: InfrastructureGenerationOptions['appManifest'];
  manifest: InfraManifestInput;
  namespace: string;
}): MinikubeAdapterArtifacts {
  const { appManifest, manifest, namespace } = args;
  const { auth } = manifest;

  if (!auth) {
    return emptyMinikubeArtifacts();
  }

  if (auth.provider !== 'supabase') {
    throw new Error(
      `Unsupported auth provider for minikube adapter: "${auth.provider}". Only "supabase" is currently supported.`,
    );
  }

  const providerArtifacts = generateSupabaseAuthArtifacts({ manifest, namespace });
  const oauthArtifacts = generateSupabaseOAuthRuntimeArtifacts({ appManifest, manifest });

  return {
    files: [...providerArtifacts.files, ...oauthArtifacts.files],
    resources: [...providerArtifacts.resources, ...oauthArtifacts.resources],
    providerLifecycle: [
      ...providerArtifacts.providerLifecycle,
      ...oauthArtifacts.providerLifecycle,
    ],
    envEntries: [...providerArtifacts.envEntries, ...oauthArtifacts.envEntries],
    warnings: [...providerArtifacts.warnings, ...oauthArtifacts.warnings],
  };
}
