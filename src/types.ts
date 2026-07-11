import type { AppManifest, InfraManifest } from '@ankhorage/contracts';

export interface GeneratedInfrastructureFile {
  /**
   * Path relative to the target app root.
   */
  readonly path: string;
  readonly content: string;
  readonly executable?: boolean;
}

export interface GeneratedPackageDependency {
  readonly name: string;
  readonly version: string;
  readonly reason: string;
}

export interface InfrastructureGenerationMeta {
  readonly target: NonNullable<InfraManifest['deployment']>['target'];
  readonly providers: readonly string[];
}

export interface InfrastructureGenerationResult {
  readonly files: readonly GeneratedInfrastructureFile[];
  readonly warnings: readonly string[];
  readonly meta: InfrastructureGenerationMeta;
  readonly dependencies: readonly GeneratedPackageDependency[];
}

export interface InfrastructureGenerationOptions {
  /**
   * Optional namespace hint from caller context, such as app slug or project id.
   */
  readonly namespaceHint?: string;
  /**
   * Optional app-level context used by provider/engine-specific generators.
   */
  readonly appManifest?: Pick<
    AppManifest,
    'data' | 'infra' | 'metadata' | 'navigator' | 'screens' | 'settings'
  >;
}

export interface InfraGenerationInput {
  /**
   * Infra manifest section from an app manifest.
   */
  readonly manifest: InfraManifestInput;
  /**
   * Optional root used by callers that want to keep output intent alongside generation.
   * The generator itself still returns relative file paths and does not write to disk.
   */
  readonly outputRoot?: string;
  readonly options?: InfrastructureGenerationOptions;
}

export type InfraGenerationOptions = InfrastructureGenerationOptions;
export type InfraGenerationResult = InfrastructureGenerationResult;
export type GeneratedFile = GeneratedInfrastructureFile;
export type PackageDependency = GeneratedPackageDependency;

export interface InfraDiagnostic {
  readonly severity: 'warning';
  readonly message: string;
}

type InfraStorageProvider = NonNullable<InfraManifest['storage']>['provider'] | 'supabase';

interface InfraStorageSpecInput {
  readonly provider: InfraStorageProvider;
  readonly buckets: readonly string[];
}

/**
 * Infra-local manifest input type.
 *
 * This is intentionally broader than `@ankhorage/contracts` to allow adapters to support
 * additional providers before the shared contracts package officially includes them.
 */
export type InfraManifestInput = Omit<InfraManifest, 'storage'> & {
  readonly storage?: InfraStorageSpecInput;
};
