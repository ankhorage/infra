import { INFRA_CAPABILITIES } from '../../constants.js';
import type { InfraCommandDefinition } from '../../types/infraCli.js';
import { prepareInfraCommandOperationAsync } from '../utils/prepareInfraCommandOperationAsync.js';
import { requireInfraSuccess } from '../utils/requireInfraSuccess.js';
import { writeInfraStructured } from '../utils/writeInfraStructured.js';

/*** Define idempotent environment creation and reconciliation. */
export const up = {
  standaloneName: 'up',
  path: ['up'],
  capability: INFRA_CAPABILITIES[3],
  summary: 'Idempotently ensure and reconcile the selected environment.',
  async run(request, services) {
    const operation = await prepareInfraCommandOperationAsync(request, services);
    const result = await services.operations.up(operation.operation, operation.dependencies);
    requireInfraSuccess(result, request.context);
    await services.writeState(operation.project.projectPath, {
      schemaVersion: 1,
      desired: operation.desired,
      ledger: result.value.ledger,
    });
    writeInfraStructured(request.context, request.arguments.format, {
      environment: result.value.environment,
      resources: result.value.resources.length,
      outputs: result.value.outputs,
    });
    return { exitCode: 0 };
  },
} as const satisfies InfraCommandDefinition;
