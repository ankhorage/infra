import type { AnkhCapabilityId } from '@ankhorage/contracts/cli';
import type { AppEnvironmentId } from '@ankhorage/contracts/environments';
import type {
  InfraEnvironmentSpec,
  InfraGeneratedArtifact,
  InfraLedger,
  InfraOutput,
} from '@ankhorage/contracts/infra';

import type {
  InfraDestroyOperationRequest,
  InfraDestroyOperationResult,
  InfraDownOperationResult,
  InfraGenerateOperationResult,
  InfraOperationRequest,
  InfraOrchestrationDependencies,
  InfraOutputsOperationResult,
  InfraPlanOperationResult,
  InfraStatusOperationResult,
  InfraStoredState,
  InfraUpOperationResult,
  InfraValidateOperationResult,
} from './infraOrchestration.js';
import type { InfraArtifactWriteResult, ResolvedInfraProject } from './infraProject.js';

type InfraCommandName =
  'validate' | 'plan' | 'generate' | 'up' | 'status' | 'outputs' | 'down' | 'destroy';

export interface InfraCommandContext {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly version: string;
  writeStdout(text: string): void;
  writeStderr(text: string): void;
}

export interface InfraCommandRunResult {
  readonly exitCode: number;
}

export interface ParsedInfraArguments {
  readonly projectId?: string;
  readonly environment?: AppEnvironmentId;
  readonly format: 'human' | 'json' | 'env';
  readonly confirmation?: string;
  readonly deleteResources: readonly string[];
}

export interface InfraCommandRunRequest {
  readonly context: InfraCommandContext;
  readonly arguments: ParsedInfraArguments;
}

type InfraCommandImplementation = (
  request: InfraCommandRunRequest,
  services: InfraCommandServices,
) => Promise<InfraCommandRunResult>;

export interface InfraCommandDefinition {
  readonly capability: AnkhCapabilityId;
  readonly path: readonly [InfraCommandName];
  readonly standaloneName: InfraCommandName;
  readonly summary: string;
  readonly run: InfraCommandImplementation;
}

export interface InfraCommandInvocation {
  readonly argv: readonly string[];
  readonly command: InfraCommandDefinition;
  readonly context: InfraCommandContext;
}

export interface InfraLifecycleOperations {
  readonly validate: (
    request: InfraOperationRequest,
    dependencies: InfraOrchestrationDependencies,
  ) => Promise<InfraValidateOperationResult>;
  readonly plan: (
    request: InfraOperationRequest,
    dependencies: InfraOrchestrationDependencies,
  ) => Promise<InfraPlanOperationResult>;
  readonly generate: (
    request: InfraOperationRequest,
    dependencies: InfraOrchestrationDependencies,
  ) => Promise<InfraGenerateOperationResult>;
  readonly up: (
    request: InfraOperationRequest,
    dependencies: InfraOrchestrationDependencies,
  ) => Promise<InfraUpOperationResult>;
  readonly status: (
    request: InfraOperationRequest,
    dependencies: InfraOrchestrationDependencies,
  ) => Promise<InfraStatusOperationResult>;
  readonly outputs: (request: InfraOperationRequest) => InfraOutputsOperationResult;
  readonly down: (
    request: InfraOperationRequest,
    dependencies: InfraOrchestrationDependencies,
  ) => Promise<InfraDownOperationResult>;
  readonly destroy: (
    request: InfraDestroyOperationRequest,
    dependencies: InfraOrchestrationDependencies,
  ) => Promise<InfraDestroyOperationResult>;
}

interface InfraDependencyScope {
  readonly projectPath: string;
  readonly environment: AppEnvironmentId;
}

export interface InfraCommandServices {
  readonly resolveProject: (options: {
    readonly cwd: string;
    readonly projectId?: string;
  }) => Promise<ResolvedInfraProject>;
  readonly readState: (
    projectPath: string,
    environment: AppEnvironmentId,
  ) => Promise<InfraStoredState | null>;
  readonly writeState: (projectPath: string, state: InfraStoredState) => Promise<void>;
  readonly removeState: (projectPath: string, environment: AppEnvironmentId) => Promise<void>;
  readonly removeCredentials: (
    projectPath: string,
    environment: AppEnvironmentId,
  ) => Promise<void>;
  readonly writeArtifacts: (
    projectPath: string,
    artifacts: readonly InfraGeneratedArtifact[],
    previous: InfraLedger | undefined,
  ) => Promise<InfraArtifactWriteResult>;
  readonly writeEnvironmentOutputs: (
    projectPath: string,
    environment: AppEnvironmentId,
    outputs: readonly InfraOutput[],
  ) => Promise<void>;
  readonly operations: InfraLifecycleOperations;
  readonly createDependencies: (
    context: InfraCommandContext,
    scope: InfraDependencyScope,
  ) => InfraOrchestrationDependencies;
}

export interface RunInfraCommandOptions {
  readonly services?: Partial<InfraCommandServices>;
}

export interface CreateInfraRuntimeProviderOptions {
  readonly runCommandImpl?: RunInfraCommandImpl;
  readonly services?: Partial<InfraCommandServices>;
}

export type RunInfraCommandImpl = (
  request: InfraCommandInvocation,
  options?: RunInfraCommandOptions,
) => Promise<InfraCommandRunResult>;

export interface PreparedInfraCommandOperation {
  readonly project: ResolvedInfraProject;
  readonly state: InfraStoredState | null;
  readonly desired: InfraEnvironmentSpec;
  readonly operation: InfraOperationRequest;
  readonly dependencies: InfraOrchestrationDependencies;
}
