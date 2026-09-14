import type { AppEnvironmentId } from '@ankhorage/contracts/environments';
import type { InfraEnvironmentSpec, InfraManifest } from '@ankhorage/contracts/infra';

import type {
  InfraCommandRunRequest,
  InfraCommandServices,
  PreparedInfraCommandOperation,
} from '../../types/infraCli.js';

/*** Resolve one command's project, desired environment, stored ownership and adapter dependencies. */
export async function prepareInfraCommandOperationAsync(
  request: InfraCommandRunRequest,
  services: InfraCommandServices,
  useStoredDesired = false,
): Promise<PreparedInfraCommandOperation> {
  const project = await services.resolveProject({
    cwd: request.context.cwd,
    ...(request.arguments.projectId === undefined
      ? {}
      : { projectId: request.arguments.projectId }),
  });
  const environment = request.arguments.environment ?? 'local';
  const state = await services.readState(project.projectPath, environment);
  const currentDesired = environmentDesired(project.manifest.infra, environment);
  const desired = useStoredDesired && state !== null ? state.desired : currentDesired;
  if (desired === undefined) {
    throw new Error(`Infra environment "${environment}" is not configured.`);
  }
  const manifest = replaceEnvironment(project.manifest.infra, environment, desired);
  return {
    project,
    state,
    desired,
    operation: {
      projectId: project.projectId,
      manifest,
      ...(request.arguments.environment === undefined ? {} : { environment }),
      ...(state === null ? {} : { previous: state.ledger, previousDesired: state.desired }),
    },
    dependencies: services.createDependencies(request.context),
  };
}

/*** Select one exact environment specification from the canonical manifest. */
function environmentDesired(
  manifest: InfraManifest,
  environment: AppEnvironmentId,
): InfraEnvironmentSpec | undefined {
  if (environment === 'local') return manifest.environments.local;
  if (environment === 'preview') return manifest.environments.preview;
  return manifest.environments.production;
}

/*** Replace one environment while preserving the rest of the canonical manifest. */
function replaceEnvironment(
  manifest: InfraManifest,
  environment: AppEnvironmentId,
  desired: InfraEnvironmentSpec,
): InfraManifest {
  return {
    ...manifest,
    environments: { ...manifest.environments, [environment]: desired },
  };
}
