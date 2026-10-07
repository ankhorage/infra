import type { Capability } from '@ankhorage/contracts/capabilities';

import type { InfraCommandDefinition } from '../../types/infraCli.js';
import { prepareInfraCommandOperationAsync } from '../utils/prepareInfraCommandOperationAsync.js';
import { requireInfraSuccess } from '../utils/requireInfraSuccess.js';
import { writeInfraStructured } from '../utils/writeInfraStructured.js';

/*** Define the manifest, compatibility, credential and selected-adapter validation command. */
export const validate = {
  standaloneName: 'validate',
  path: ['validate'],
  capability: 'infra.validate' satisfies Capability['id'],
  summary: 'Validate manifest, compatibility, credentials and selected adapters.',
  async run(request, services) {
    const operation = await prepareInfraCommandOperationAsync(request, services);
    const result = await services.operations.validate(operation.operation, operation.dependencies);
    requireInfraSuccess(result, request.context);
    writeInfraStructured(request.context, request.arguments.format, result.value);
    return { exitCode: 0 };
  },
} as const satisfies InfraCommandDefinition;
