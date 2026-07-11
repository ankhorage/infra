import { generateApiInfrastructureArtifacts } from '../../apis';
import type {
  GeneratedPackageDependency,
  InfraManifestInput,
  InfrastructureGenerationOptions,
  InfrastructureGenerationResult,
} from '../../types';
import { generateAuthProviderArtifacts } from './auth';
import { generateAuthorizationArtifacts } from './authz';
import { generateMinikubeBaseArtifacts } from './base';
import { generateStorageArtifacts } from './storage';

const DEFAULT_NAMESPACE = 'ankh-app';

export function generateMinikubeInfra(
  manifest: InfraManifestInput,
  options: InfrastructureGenerationOptions = {},
): InfrastructureGenerationResult {
  if (manifest.deployment?.target !== 'minikube') {
    throw new Error(
      `Minikube adapter only supports deployment target "minikube" (received "${manifest.deployment?.target ?? 'undefined'}").`,
    );
  }

  if (manifest.database?.provider && manifest.database.provider !== 'supabase') {
    throw new Error(
      `Unsupported database provider for minikube adapter: "${manifest.database.provider}". Only "supabase" is implemented.`,
    );
  }

  const namespace = resolveNamespace(manifest, options);

  const authArtifacts = generateAuthProviderArtifacts({ manifest, namespace });
  const authzArtifacts = generateAuthorizationArtifacts({
    manifest,
    namespace,
    appManifest: options.appManifest,
  });
  const storageArtifacts = generateStorageArtifacts({ manifest, namespace });
  const apiArtifacts = generateApiInfrastructureArtifacts({
    data: options.appManifest?.data,
    databaseProvider: manifest.database?.provider,
  });

  const extraResources = unique([
    ...authArtifacts.resources,
    ...authzArtifacts.resources,
    ...storageArtifacts.resources,
  ]);
  const extraEnvEntries = unique([
    ...authArtifacts.envEntries,
    ...authzArtifacts.envEntries,
    ...storageArtifacts.envEntries,
  ]);

  const baseFiles = generateMinikubeBaseArtifacts({
    manifest,
    namespace,
    extraResources,
    extraEnvEntries,
  });

  const warnings = unique([
    ...collectWarnings(manifest),
    ...authArtifacts.warnings,
    ...authzArtifacts.warnings,
    ...storageArtifacts.warnings,
    ...apiArtifacts.warnings,
  ]);

  return {
    files: [
      ...baseFiles,
      ...authArtifacts.files,
      ...authzArtifacts.files,
      ...storageArtifacts.files,
      ...apiArtifacts.files,
    ],
    warnings,
    meta: {
      target: 'minikube',
      providers: collectProviders(manifest),
    },
    dependencies: collectDependencies(manifest),
  };
}

function collectProviders(manifest: InfraManifestInput): string[] {
  const providers = new Set<string>();

  if (manifest.auth?.provider) providers.add(manifest.auth.provider);
  if (manifest.auth?.authorization?.engine) {
    providers.add(manifest.auth.authorization.engine);
  }
  if (manifest.database?.provider) providers.add(manifest.database.provider);
  if (manifest.storage?.provider) providers.add(manifest.storage.provider);
  if (manifest.state?.provider) providers.add(manifest.state.provider);

  return [...providers].sort();
}

function collectDependencies(manifest: InfraManifestInput): readonly GeneratedPackageDependency[] {
  if (manifest.state?.provider !== 'legend') {
    return [];
  }

  return [
    {
      name: '@ankhorage/state-legend',
      version: '^0.1.0',
      reason: 'Selected by infra.state.provider=legend.',
    },
  ];
}

function collectWarnings(manifest: InfraManifestInput): string[] {
  const warnings: string[] = [];

  if (manifest.deployment?.monitoring) {
    warnings.push(
      'Monitoring is enabled in manifest, but monitoring stack resources are not generated yet.',
    );
  }

  if (manifest.networking?.cdn) {
    warnings.push('CDN is enabled in manifest, but CDN resources are not generated for minikube.');
  }

  return warnings;
}

function resolveNamespace(
  manifest: InfraManifestInput,
  options: InfrastructureGenerationOptions,
): string {
  const source =
    manifest.networking?.domain?.trim() ?? options.namespaceHint?.trim() ?? DEFAULT_NAMESPACE;

  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const safe = normalized.slice(0, 63).replace(/-+$/g, '');
  return safe || DEFAULT_NAMESPACE;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
