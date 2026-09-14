import { INFRA_CAPABILITIES } from '../../constants.js';
import type { InfraCommandDefinition } from '../../types/infraCli.js';
import { prepareInfraCommandOperationAsync } from '../utils/prepareInfraCommandOperationAsync.js';
import { requireInfraSuccess } from '../utils/requireInfraSuccess.js';
import { writeInfraStructured } from '../utils/writeInfraStructured.js';

/*** Define deterministic review-artifact generation without remote side effects. */
export const generate = {
  standaloneName: 'generate',
  path: ['generate'],
  capability: INFRA_CAPABILITIES[2],
  summary: 'Generate deterministic review artifacts without remote side effects.',
  async run(request, services) {
    const operation = await prepareInfraCommandOperationAsync(request, services);
    const result = await services.operations.generate(operation.operation, operation.dependencies);
    requireInfraSuccess(result, request.context);
    const written = await services.writeArtifacts(
      operation.project.projectPath,
      result.value.artifacts,
      operation.state?.ledger,
    );
    await services.writeState(operation.project.projectPath, {
      schemaVersion: 1,
      desired: operation.desired,
      ledger: result.value.ledger,
    });
    writeInfraStructured(request.context, request.arguments.format, {
      environment: result.value.environment,
      ...written,
      artifacts: result.value.artifacts.map(({ path }) => path),
    });
    return { exitCode: 0 };
  },
} as const satisfies InfraCommandDefinition;
