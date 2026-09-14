import type { AppEnvironmentId } from '@ankhorage/contracts/environments';
import type {
  InfraComputeAdapter,
  InfraComputeSnapshot,
  InfraComputeTarget,
  InfraDestroyRequest,
  InfraEnvironmentSpec,
  InfraExecutionContext,
  InfraGeneratedArtifact,
  InfraLedger,
  InfraManifest,
  InfraOutput,
  InfraOwnedResource,
  InfraPlan,
  InfraResult,
  InfraRuntimeAdapter,
  InfraRuntimeDesiredState,
  InfraServiceAdapter,
  InfraStatus,
} from '@ankhorage/contracts/infra';

import type { InfraAdapterPackageResolver } from '../features/environment-lifecycle/application/ports/outbound/infraAdapterPackage.js';

export interface ResolvedInfraEnvironment {
  readonly id: AppEnvironmentId;
  readonly desired: InfraEnvironmentSpec;
  readonly manifest: InfraManifest;
}

export interface InfraEnvironmentResolutionRequest {
  readonly environment?: string;
  readonly manifest: InfraManifest;
  readonly operation:
    'validate' | 'plan' | 'generate' | 'up' | 'status' | 'outputs' | 'down' | 'destroy';
}

export interface ResolvedInfraAdapters {
  readonly compute: InfraComputeAdapter;
  readonly runtime: InfraRuntimeAdapter;
  readonly services: readonly InfraServiceAdapter[];
}

export interface InfraStoredState {
  readonly schemaVersion: 1;
  readonly desired: InfraEnvironmentSpec;
  readonly ledger: InfraLedger;
}

export interface PreparedInfraOperation {
  readonly environment: ResolvedInfraEnvironment;
  readonly context: InfraExecutionContext;
  readonly adapters: ResolvedInfraAdapters;
  readonly compute: InfraComputeSnapshot;
  readonly runtimeDesired: InfraRuntimeDesiredState;
}

export interface InfraOrchestrationDependencies {
  readonly adapterResolver: InfraAdapterPackageResolver;
  readonly credentials: InfraExecutionContext['credentials'];
  readonly secrets: InfraExecutionContext['secrets'];
}

export interface InfraOperationRequest {
  readonly projectId: string;
  readonly manifest: InfraManifest;
  readonly environment?: string;
  readonly previous?: InfraLedger;
  readonly previousDesired?: InfraEnvironmentSpec;
  readonly signal?: AbortSignal;
}

export interface InfraDestroyOperationRequest extends InfraOperationRequest {
  readonly confirmation: InfraDestroyRequest['confirmation'];
  readonly persistence: InfraDestroyRequest['persistence'];
}

export interface InfraValidateResult {
  readonly environment: AppEnvironmentId;
}

export type InfraValidateOperationResult = InfraResult<InfraValidateResult>;

export type InfraUpRequest = InfraOperationRequest;

export interface InfraUpResult {
  readonly environment: AppEnvironmentId;
  readonly targets: readonly InfraComputeTarget[];
  readonly resources: readonly InfraOwnedResource[];
  readonly outputs: readonly InfraOutput[];
  readonly ledger: InfraLedger;
}

export type InfraUpOperationResult = InfraResult<InfraUpResult>;

export type InfraPlanOperationResult = InfraResult<InfraPlan>;

export interface InfraGenerateResult {
  readonly environment: AppEnvironmentId;
  readonly artifacts: readonly InfraGeneratedArtifact[];
  readonly ledger: InfraLedger;
}

export type InfraGenerateOperationResult = InfraResult<InfraGenerateResult>;

export type InfraStatusOperationResult = InfraResult<InfraStatus>;

export interface InfraOutputsResult {
  readonly environment: AppEnvironmentId;
  readonly outputs: readonly InfraOutput[];
}

export type InfraOutputsOperationResult = InfraResult<InfraOutputsResult>;

export interface InfraDownResult {
  readonly environment: AppEnvironmentId;
  readonly ledger: InfraLedger;
}

export type InfraDownOperationResult = InfraResult<InfraDownResult>;

export interface InfraDestroyResult {
  readonly environment: AppEnvironmentId;
  readonly ledger: InfraLedger | null;
}

export type InfraDestroyOperationResult = InfraResult<InfraDestroyResult>;
