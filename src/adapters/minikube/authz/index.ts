import type { AppManifest } from '@ankhorage/contracts';

import type { InfraManifestInput } from '../../../types';
import { emptyMinikubeArtifacts, type MinikubeAdapterArtifacts } from '../contracts';
import { generateCerbosAuthzArtifacts } from './cerbos';

export function generateAuthorizationArtifacts(args: {
  manifest: InfraManifestInput;
  namespace: string;
  appManifest?: Pick<AppManifest, 'metadata' | 'navigator' | 'screens' | 'settings'>;
}): MinikubeAdapterArtifacts {
  const { manifest, namespace, appManifest } = args;
  const engine = manifest.auth?.authorization.engine;

  if (!engine) {
    return emptyMinikubeArtifacts();
  }

  switch (engine) {
    case 'cerbos':
      return generateCerbosAuthzArtifacts({ manifest, namespace, appManifest });
    case 'native':
      return {
        ...emptyMinikubeArtifacts(),
        warnings: [
          'Authorization engine "native" selected. No dedicated authz infrastructure artifacts were generated.',
        ],
      };
    default:
      throw new Error(`Unsupported authorization engine for minikube adapter: ${String(engine)}`);
  }
}
