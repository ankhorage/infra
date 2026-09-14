import type { AppManifest } from '@ankhorage/contracts';
import type { AppEnvironmentId } from '@ankhorage/contracts/environments';
import type { InfraDestroyRequest, InfraManifest } from '@ankhorage/contracts/infra';

import type { InfraCommandServices } from './infraCli.js';
import type {
  InfraDestroyOperationResult,
  InfraDownOperationResult,
  InfraGenerateOperationResult,
  InfraOutputsOperationResult,
  InfraPlanOperationResult,
  InfraStatusOperationResult,
  InfraUpOperationResult,
  InfraValidateOperationResult,
} from './infraOrchestration.js';

export interface InfraArtifactWriteResult {
  readonly written: number;
  readonly removed: number;
}

export interface ResolvedInfraProject {
  readonly appsRoot: string;
  readonly manifest: AppManifest;
  readonly manifestPath: string;
  readonly projectId: string;
  readonly projectPath: string;
  readonly workspaceRoot: string;
}

export interface ProjectInfraOperationRequest {
  readonly projectId: string;
  readonly projectPath: string;
  readonly manifest: InfraManifest;
  readonly environment: AppEnvironmentId;
  readonly executionEnvironment?: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
}

export interface ProjectInfraDestroyRequest extends ProjectInfraOperationRequest {
  readonly confirmation: InfraDestroyRequest['confirmation'];
  readonly persistence: InfraDestroyRequest['persistence'];
}

export interface ProjectInfraLifecycle {
  validateAsync(request: ProjectInfraOperationRequest): Promise<InfraValidateOperationResult>;
  planAsync(request: ProjectInfraOperationRequest): Promise<InfraPlanOperationResult>;
  generateAsync(request: ProjectInfraOperationRequest): Promise<InfraGenerateOperationResult>;
  upAsync(request: ProjectInfraOperationRequest): Promise<InfraUpOperationResult>;
  statusAsync(request: ProjectInfraOperationRequest): Promise<InfraStatusOperationResult>;
  outputsAsync(request: ProjectInfraOperationRequest): Promise<InfraOutputsOperationResult>;
  downAsync(request: ProjectInfraOperationRequest): Promise<InfraDownOperationResult>;
  destroyAsync(request: ProjectInfraDestroyRequest): Promise<InfraDestroyOperationResult>;
}

export interface CreateProjectInfraLifecycleOptions {
  readonly services?: Partial<InfraCommandServices>;
}
