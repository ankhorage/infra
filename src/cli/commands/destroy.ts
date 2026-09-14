import type { AppEnvironmentId } from '@ankhorage/contracts/environments';

import { INFRA_CAPABILITIES } from '../../constants.js';
import type { InfraCommandDefinition } from '../../types/infraCli.js';
import type { InfraDestroyOperationRequest } from '../../types/infraOrchestration.js';
import { prepareInfraCommandOperationAsync } from '../utils/prepareInfraCommandOperationAsync.js';
import { requireInfraSuccess } from '../utils/requireInfraSuccess.js';
import { resolveInfraPersistence } from '../utils/resolveInfraPersistence.js';
import { writeInfraStructured } from '../utils/writeInfraStructured.js';

/*** Define exact-scope destruction behind environment and persistent-resource confirmation. */
export const destroy = {
  standaloneName: 'destroy',
  path: ['destroy'],
  capability: INFRA_CAPABILITIES[7],
  summary: 'Destroy exact owned resources behind explicit confirmation.',
  async run(request, services) {
    const operation = await prepareInfraCommandOperationAsync(request, services, true);
    const environment = requireEnvironment(request.arguments.environment);
    const confirmation = `${operation.project.projectId}:${environment}`;
    if (request.arguments.confirmation !== confirmation) {
      throw new Error(`Infra destroy requires --confirm ${confirmation}.`);
    }
    const destroyRequest: InfraDestroyOperationRequest = {
      ...operation.operation,
      environment,
      confirmation: { projectId: operation.project.projectId, environment },
      persistence: resolveInfraPersistence(
        operation.state?.ledger,
        request.arguments.deleteResources,
      ),
    };
    const result = await services.operations.destroy(destroyRequest, operation.dependencies);
    requireInfraSuccess(result, request.context);
    await services.writeArtifacts(operation.project.projectPath, [], operation.state?.ledger);
    if (result.value.ledger === null) {
      await services.removeState(operation.project.projectPath, environment);
    } else {
      await services.writeState(operation.project.projectPath, {
        schemaVersion: 1,
        desired: operation.desired,
        ledger: result.value.ledger,
      });
    }
    writeInfraStructured(request.context, request.arguments.format, {
      environment: result.value.environment,
      retainedResources: result.value.ledger?.resources.length ?? 0,
    });
    return { exitCode: 0 };
  },
} as const satisfies InfraCommandDefinition;

/*** Require the explicit destroy environment after CLI parsing. */
function requireEnvironment(value: AppEnvironmentId | undefined): AppEnvironmentId {
  if (value === undefined) throw new Error('Infra destroy requires an explicit environment.');
  return value;
}
