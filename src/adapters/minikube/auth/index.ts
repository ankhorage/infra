import type { InfraManifestInput } from '../../../types';
import { emptyMinikubeArtifacts, type MinikubeAdapterArtifacts } from '../contracts';
import { generateSupabaseAuthArtifacts } from './supabase';

export function generateAuthProviderArtifacts(args: {
  manifest: InfraManifestInput;
  namespace: string;
}): MinikubeAdapterArtifacts {
  const { manifest, namespace } = args;
  const { auth } = manifest;

  if (!auth) {
    return emptyMinikubeArtifacts();
  }

  if (auth.provider !== 'supabase') {
    throw new Error(
      `Unsupported auth provider for minikube adapter: "${auth.provider}". Only "supabase" is currently supported.`,
    );
  }

  return generateSupabaseAuthArtifacts({ manifest, namespace });
}
