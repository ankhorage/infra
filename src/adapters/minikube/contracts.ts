import type { GeneratedInfrastructureFile } from '../../types';

export interface MinikubeAdapterArtifacts {
  files: GeneratedInfrastructureFile[];
  resources: string[];
  envEntries: string[];
  warnings: string[];
}

export function emptyMinikubeArtifacts(): MinikubeAdapterArtifacts {
  return {
    files: [],
    resources: [],
    envEntries: [],
    warnings: [],
  };
}
