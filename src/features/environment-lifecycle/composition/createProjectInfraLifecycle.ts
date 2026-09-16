import type { InfraEnvironmentSpec, InfraManifest } from '@ankhorage/contracts/infra';

import { INFRA_PACKAGE_VERSION } from '../../../constants.js';
import type { InfraOperationRequest, InfraStoredState } from '../../../types/infraOrchestration.js';
import type {
  CreateProjectInfraLifecycleOptions,
  ProjectInfraLifecycle,
  ProjectInfraOperationRequest,
} from '../../../types/infraProject.js';
import { createInfraCommandServices } from './createInfraCommandServices.js';

/*** Create the typed project-facing Infra lifecycle backed by canonical use cases and ownership state. */
export function createProjectInfraLifecycle(
  options: CreateProjectInfraLifecycleOptions = {},
): ProjectInfraLifecycle {
  const services = createInfraCommandServices(options.services);
  return {
    async validateAsync(request) {
      const prepared = await prepareProjectOperationAsync(request, services);
      return services.operations.validate(prepared.operation, prepared.dependencies);
    },
    async planAsync(request) {
      const prepared = await prepareProjectOperationAsync(request, services);
      return services.operations.plan(prepared.operation, prepared.dependencies);
    },
    async generateAsync(request) {
      const prepared = await prepareProjectOperationAsync(request, services);
      const result = await services.operations.generate(prepared.operation, prepared.dependencies);
      if (!result.ok) return result;
      await services.writeArtifacts(
        request.projectPath,
        result.value.artifacts,
        prepared.state?.ledger,
      );
      await services.writeState(request.projectPath, {
        schemaVersion: 1,
        desired: prepared.desired,
        ledger: result.value.ledger,
      });
      return result;
    },
    async upAsync(request) {
      const prepared = await prepareProjectOperationAsync(request, services);
      const result = await services.operations.up(prepared.operation, prepared.dependencies);
      if (!result.ok) return result;
      await services.writeState(request.projectPath, {
        schemaVersion: 1,
        desired: prepared.desired,
        ledger: result.value.ledger,
      });
      return result;
    },
    async statusAsync(request) {
      const prepared = await prepareProjectOperationAsync(request, services);
      return services.operations.status(prepared.operation, prepared.dependencies);
    },
    async outputsAsync(request) {
      const prepared = await prepareProjectOperationAsync(request, services);
      return services.operations.outputs(prepared.operation);
    },
    async downAsync(request) {
      const prepared = await prepareProjectOperationAsync(request, services);
      const result = await services.operations.down(prepared.operation, prepared.dependencies);
      if (!result.ok) return result;
      await services.writeState(request.projectPath, {
        schemaVersion: 1,
        desired: prepared.desired,
        ledger: result.value.ledger,
      });
      return result;
    },
    async destroyAsync(request) {
      const state = await services.readState(request.projectPath, request.environment);
      if (state === null) {
        return {
          ok: true,
          value: { environment: request.environment, ledger: null },
          diagnostics: [],
        };
      }
      const prepared = await prepareProjectOperationAsync(request, services, true, state);
      const result = await services.operations.destroy(
        {
          ...prepared.operation,
          confirmation: request.confirmation,
          persistence: request.persistence,
        },
        prepared.dependencies,
      );
      if (!result.ok) return result;
      await services.writeArtifacts(request.projectPath, [], prepared.state?.ledger);
      if (result.value.ledger === null)
        await services.removeState(request.projectPath, request.environment);
      else {
        await services.writeState(request.projectPath, {
          schemaVersion: 1,
          desired: prepared.desired,
          ledger: result.value.ledger,
        });
      }
      return result;
    },
  };
}

interface PreparedProjectOperation {
  readonly operation: InfraOperationRequest;
  readonly desired: InfraEnvironmentSpec;
  readonly state: InfraStoredState | null;
  readonly dependencies: ReturnType<
    ReturnType<typeof createInfraCommandServices>['createDependencies']
  >;
}

/*** Resolve one explicit project/environment request with its prior ownership state and dependencies. */
async function prepareProjectOperationAsync(
  request: ProjectInfraOperationRequest,
  services: ReturnType<typeof createInfraCommandServices>,
  useStoredDesired = false,
  knownState?: InfraStoredState,
): Promise<PreparedProjectOperation> {
  const state = knownState ?? (await services.readState(request.projectPath, request.environment));
  const currentDesired = readEnvironment(request.manifest, request.environment);
  const desired = useStoredDesired && state !== null ? state.desired : currentDesired;
  if (desired === undefined) {
    throw new Error(`Infra environment "${request.environment}" is not configured.`);
  }
  const context = {
    cwd: request.projectPath,
    env: request.executionEnvironment ?? process.env,
    version: INFRA_PACKAGE_VERSION,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  };
  return {
    state,
    desired,
    operation: {
      projectId: request.projectId,
      manifest: replaceEnvironment(request.manifest, request.environment, desired),
      environment: request.environment,
      ...(state === null ? {} : { previous: state.ledger, previousDesired: state.desired }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    },
    dependencies: services.createDependencies(context),
  };
}

/*** Read one exact environment without inventing a fallback. */
function readEnvironment(
  manifest: InfraManifest,
  environment: ProjectInfraOperationRequest['environment'],
): InfraEnvironmentSpec | undefined {
  if (environment === 'local') return manifest.environments.local;
  if (environment === 'preview') return manifest.environments.preview;
  return manifest.environments.production;
}

/*** Replace one selected environment while preserving all other manifest state. */
function replaceEnvironment(
  manifest: InfraManifest,
  environment: ProjectInfraOperationRequest['environment'],
  desired: InfraEnvironmentSpec,
): InfraManifest {
  return { ...manifest, environments: { ...manifest.environments, [environment]: desired } };
}
