import type { InfraCommandServices } from '../../../types/infraCli.js';
import { createEnvironmentInfraCredentialPort } from '../adapters/outbound/createEnvironmentInfraCredentialPort.js';
import { createEnvironmentInfraSecretPort } from '../adapters/outbound/createEnvironmentInfraSecretPort.js';
import { createNodeInfraAdapterPackageResolver } from '../adapters/outbound/createNodeInfraAdapterPackageResolver.js';
import { readStoredInfraStateAsync } from '../adapters/outbound/readStoredInfraStateAsync.js';
import { removeStoredInfraStateAsync } from '../adapters/outbound/removeStoredInfraStateAsync.js';
import { resolveInfraProjectAsync } from '../adapters/outbound/resolveInfraProjectAsync.js';
import { writeInfraGeneratedArtifactsAsync } from '../adapters/outbound/writeInfraGeneratedArtifactsAsync.js';
import { writeStoredInfraStateAsync } from '../adapters/outbound/writeStoredInfraStateAsync.js';
import { destroyInfraEnvironmentAsync } from '../application/use-cases/destroyInfraEnvironmentAsync.js';
import { downInfraEnvironmentAsync } from '../application/use-cases/downInfraEnvironmentAsync.js';
import { generateInfraEnvironmentAsync } from '../application/use-cases/generateInfraEnvironmentAsync.js';
import { getInfraEnvironmentOutputs } from '../application/use-cases/getInfraEnvironmentOutputs.js';
import { planInfraEnvironmentAsync } from '../application/use-cases/planInfraEnvironmentAsync.js';
import { statusInfraEnvironmentAsync } from '../application/use-cases/statusInfraEnvironmentAsync.js';
import { upInfraEnvironmentAsync } from '../application/use-cases/upInfraEnvironmentAsync.js';
import { validateInfraEnvironmentAsync } from '../application/use-cases/validateInfraEnvironmentAsync.js';

/*** Compose command use cases with filesystem, environment-value and package-resolver adapters. */
export function createInfraCommandServices(
  overrides: Partial<InfraCommandServices> = {},
): InfraCommandServices {
  return {
    resolveProject: overrides.resolveProject ?? resolveInfraProjectAsync,
    readState: overrides.readState ?? readStoredInfraStateAsync,
    writeState: overrides.writeState ?? writeStoredInfraStateAsync,
    removeState: overrides.removeState ?? removeStoredInfraStateAsync,
    writeArtifacts: overrides.writeArtifacts ?? writeInfraGeneratedArtifactsAsync,
    operations: overrides.operations ?? {
      validate: validateInfraEnvironmentAsync,
      plan: planInfraEnvironmentAsync,
      generate: generateInfraEnvironmentAsync,
      up: upInfraEnvironmentAsync,
      status: statusInfraEnvironmentAsync,
      outputs: getInfraEnvironmentOutputs,
      down: downInfraEnvironmentAsync,
      destroy: destroyInfraEnvironmentAsync,
    },
    createDependencies:
      overrides.createDependencies ??
      ((context) => ({
        adapterResolver: createNodeInfraAdapterPackageResolver(),
        credentials: createEnvironmentInfraCredentialPort(context.env),
        secrets: createEnvironmentInfraSecretPort(context.env),
      })),
  };
}
