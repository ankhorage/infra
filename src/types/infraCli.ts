import type { AnkhCapabilityId } from '@ankhorage/contracts/cli';
import type { AppEnvironmentId } from '@ankhorage/contracts/environments';
import type { InfraEnvironmentSpec } from '@ankhorage/contracts/infra';

import type { readStoredInfraStateAsync } from '../features/environment-lifecycle/adapters/outbound/readStoredInfraStateAsync.js';
import type { removeStoredInfraStateAsync } from '../features/environment-lifecycle/adapters/outbound/removeStoredInfraStateAsync.js';
import type { writeInfraGeneratedArtifactsAsync } from '../features/environment-lifecycle/adapters/outbound/writeInfraGeneratedArtifactsAsync.js';
import type { writeStoredInfraStateAsync } from '../features/environment-lifecycle/adapters/outbound/writeStoredInfraStateAsync.js';
import type { destroyInfraEnvironmentAsync } from '../features/environment-lifecycle/application/use-cases/destroyInfraEnvironmentAsync.js';
import type { downInfraEnvironmentAsync } from '../features/environment-lifecycle/application/use-cases/downInfraEnvironmentAsync.js';
import type { generateInfraEnvironmentAsync } from '../features/environment-lifecycle/application/use-cases/generateInfraEnvironmentAsync.js';
import type { getInfraEnvironmentOutputs } from '../features/environment-lifecycle/application/use-cases/getInfraEnvironmentOutputs.js';
import type { planInfraEnvironmentAsync } from '../features/environment-lifecycle/application/use-cases/planInfraEnvironmentAsync.js';
import type { statusInfraEnvironmentAsync } from '../features/environment-lifecycle/application/use-cases/statusInfraEnvironmentAsync.js';
import type { upInfraEnvironmentAsync } from '../features/environment-lifecycle/application/use-cases/upInfraEnvironmentAsync.js';
import type { validateInfraEnvironmentAsync } from '../features/environment-lifecycle/application/use-cases/validateInfraEnvironmentAsync.js';
import type {
  InfraOperationRequest,
  InfraOrchestrationDependencies,
  InfraStoredState,
} from './infraOrchestration.js';
import type { ResolvedInfraProject } from './infraProject.js';

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
  readonly validate: typeof validateInfraEnvironmentAsync;
  readonly plan: typeof planInfraEnvironmentAsync;
  readonly generate: typeof generateInfraEnvironmentAsync;
  readonly up: typeof upInfraEnvironmentAsync;
  readonly status: typeof statusInfraEnvironmentAsync;
  readonly outputs: typeof getInfraEnvironmentOutputs;
  readonly down: typeof downInfraEnvironmentAsync;
  readonly destroy: typeof destroyInfraEnvironmentAsync;
}

export interface InfraCommandServices {
  readonly resolveProject: (options: {
    readonly cwd: string;
    readonly projectId?: string;
  }) => Promise<ResolvedInfraProject>;
  readonly readState: typeof readStoredInfraStateAsync;
  readonly writeState: typeof writeStoredInfraStateAsync;
  readonly removeState: typeof removeStoredInfraStateAsync;
  readonly writeArtifacts: typeof writeInfraGeneratedArtifactsAsync;
  readonly operations: InfraLifecycleOperations;
  readonly createDependencies: (context: InfraCommandContext) => InfraOrchestrationDependencies;
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
