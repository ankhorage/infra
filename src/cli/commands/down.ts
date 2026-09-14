import { INFRA_CAPABILITIES } from '../../constants.js';
import type { InfraCommandDefinition } from '../../types/infraCli.js';
import { prepareInfraCommandOperationAsync } from '../utils/prepareInfraCommandOperationAsync.js';
import { requireInfraSuccess } from '../utils/requireInfraSuccess.js';
import { writeInfraStructured } from '../utils/writeInfraStructured.js';

/*** Define reversible runtime suspension while retaining persistent resources. */
export const down = {
  standaloneName: 'down',
  path: ['down'],
  capability: INFRA_CAPABILITIES[6],
  summary: 'Reversibly suspend runtime workloads while retaining persistent data.',
  async run(request, services) {
    const operation = await prepareInfraCommandOperationAsync(request, services);
    const result = await services.operations.down(operation.operation, operation.dependencies);
    requireInfraSuccess(result, request.context);
    await services.writeState(operation.project.projectPath, {
      schemaVersion: 1,
      desired: operation.desired,
      ledger: result.value.ledger,
    });
    writeInfraStructured(request.context, request.arguments.format, {
      environment: result.value.environment,
      state: 'stopped',
    });
    return { exitCode: 0 };
  },
} as const satisfies InfraCommandDefinition;
