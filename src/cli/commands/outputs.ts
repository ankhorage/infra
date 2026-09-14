import { INFRA_CAPABILITIES } from '../../constants.js';
import type { InfraCommandDefinition } from '../../types/infraCli.js';
import { prepareInfraCommandOperationAsync } from '../utils/prepareInfraCommandOperationAsync.js';
import { requireInfraSuccess } from '../utils/requireInfraSuccess.js';
import { writeInfraEnvironmentOutputs } from '../utils/writeInfraEnvironmentOutputs.js';
import { writeInfraStructured } from '../utils/writeInfraStructured.js';

/*** Define safe public-output and secret-reference presentation. */
export const outputs = {
  standaloneName: 'outputs',
  path: ['outputs'],
  capability: INFRA_CAPABILITIES[5],
  summary: 'Print safe public outputs and secret references.',
  async run(request, services) {
    const operation = await prepareInfraCommandOperationAsync(request, services);
    const result = services.operations.outputs(operation.operation);
    requireInfraSuccess(result, request.context);
    if (request.arguments.format === 'env') {
      writeInfraEnvironmentOutputs(request.context, result.value.outputs);
    } else {
      writeInfraStructured(request.context, request.arguments.format, result.value);
    }
    return { exitCode: 0 };
  },
} as const satisfies InfraCommandDefinition;
