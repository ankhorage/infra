import type { GeneratedInfrastructureFile } from '../../types';

interface MinikubeProviderEndpoint {
  name: string;
  url: string;
}

interface MinikubeProviderReadinessCheck {
  label: string;
  namespace: string;
  resource: string;
  timeoutSeconds: number;
}

interface MinikubeProviderLifecycleCommand {
  label: string;
  command: string;
}

export interface MinikubeProviderLifecycle {
  id: string;
  namespace: string;
  endpoints: MinikubeProviderEndpoint[];
  readinessChecks: MinikubeProviderReadinessCheck[];
  migrationCommands: MinikubeProviderLifecycleCommand[];
  reconciliationCommands: MinikubeProviderLifecycleCommand[];
  statusChecks: MinikubeProviderLifecycleCommand[];
}

export interface MinikubeAdapterArtifacts {
  files: GeneratedInfrastructureFile[];
  resources: string[];
  providerLifecycle: MinikubeProviderLifecycle[];
  envEntries: string[];
  warnings: string[];
}

export function emptyMinikubeArtifacts(): MinikubeAdapterArtifacts {
  return {
    files: [],
    resources: [],
    providerLifecycle: [],
    envEntries: [],
    warnings: [],
  };
}
