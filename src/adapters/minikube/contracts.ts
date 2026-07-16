import type { GeneratedInfrastructureFile } from '../../types';

export interface MinikubeAdapterArtifacts {
  files: GeneratedInfrastructureFile[];
  resources: string[];
  providerNamespaces: string[];
  envEntries: string[];
  warnings: string[];
}

export function emptyMinikubeArtifacts(): MinikubeAdapterArtifacts {
  return {
    files: [],
    resources: [],
    providerNamespaces: [],
    envEntries: [],
    warnings: [],
  };
}
