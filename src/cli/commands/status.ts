import { INFRA_CAPABILITIES } from '../../constants.js';
import type { InfraCommandDefinition } from '../../types/infraCli.js';
import { prepareInfraCommandOperationAsync } from '../utils/prepareInfraCommandOperationAsync.js';
import { requireInfraSuccess } from '../utils/requireInfraSuccess.js';
import { writeInfraStructured } from '../utils/writeInfraStructured.js';

/*** Define provider-neutral environment status aggregation. */
export const status = {
  standaloneName: 'status',
  path: ['status'],
  capability: INFRA_CAPABILITIES[4],
  summary: 'Aggregate provider-neutral environment status.',
  async run(request, services) {
    const operation = await prepareInfraCommandOperationAsync(request, services);
    const result = await services.operations.status(operation.operation, operation.dependencies);
    requireInfraSuccess(result, request.context);
    writeInfraStructured(request.context, request.arguments.format, result.value);
    return { exitCode: 0 };
  },
} as const satisfies InfraCommandDefinition;
