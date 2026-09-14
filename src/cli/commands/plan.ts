import { INFRA_CAPABILITIES } from '../../constants.js';
import type { InfraCommandDefinition } from '../../types/infraCli.js';
import { prepareInfraCommandOperationAsync } from '../utils/prepareInfraCommandOperationAsync.js';
import { requireInfraSuccess } from '../utils/requireInfraSuccess.js';
import { writeInfraStructured } from '../utils/writeInfraStructured.js';

/*** Define the ordered side-effect-free infrastructure planning command. */
export const plan = {
  standaloneName: 'plan',
  path: ['plan'],
  capability: INFRA_CAPABILITIES[1],
  summary: 'Print an ordered side-effect-free infrastructure plan.',
  async run(request, services) {
    const operation = await prepareInfraCommandOperationAsync(request, services);
    const result = await services.operations.plan(operation.operation, operation.dependencies);
    requireInfraSuccess(result, request.context);
    writeInfraStructured(request.context, request.arguments.format, result.value);
    return { exitCode: 0 };
  },
} as const satisfies InfraCommandDefinition;
