import { generateMinikubeInfra } from './adapters/minikube';
import type {
  InfraGenerationInput,
  InfraManifestInput,
  InfrastructureGenerationOptions,
  InfrastructureGenerationResult,
} from './types';

export type { DatasetInfrastructureArtifacts } from './datasets';
export { generateDatasetInfrastructureArtifacts } from './datasets';
export type {
  GeneratedFile,
  GeneratedInfrastructureFile,
  GeneratedPackageDependency,
  InfraDiagnostic,
  InfraGenerationInput,
  InfraGenerationOptions,
  InfraGenerationResult,
  InfraManifestInput,
  InfrastructureGenerationMeta,
  InfrastructureGenerationOptions,
  InfrastructureGenerationResult,
  PackageDependency,
} from './types';

export function generateInfra(input: InfraGenerationInput): InfrastructureGenerationResult {
  return generateInfrastructure(input.manifest, input.options ?? {});
}

export function generateInfrastructure(
  manifest: InfraManifestInput,
  options: InfrastructureGenerationOptions = {},
): InfrastructureGenerationResult {
  if (!manifest.deployment) {
    throw new Error('Deployment configuration is missing.');
  }

  if (manifest.deployment.target !== 'minikube') {
    throw new Error(`Unsupported deployment target: ${manifest.deployment.target}`);
  }

  return generateMinikubeInfra(manifest, options);
}
