import type {
  InfraOperationRequest,
  InfraOutputsOperationResult,
} from '../../../../types/infraOrchestration.js';
import { resolveInfraEnvironment } from '../../domain/resolveInfraEnvironment.js';

/*** Return only safe serialized public outputs and secret references from the canonical ledger. */
export function getInfraEnvironmentOutputs(
  request: InfraOperationRequest,
): InfraOutputsOperationResult {
  const environment = resolveInfraEnvironment({
    manifest: request.manifest,
    environment: request.environment,
    operation: 'outputs',
  });
  if (!environment.ok) return environment;
  if (
    request.previous !== undefined &&
    (request.previous.projectId !== request.projectId ||
      request.previous.environment !== environment.value.id)
  ) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'infra-ledger-scope-mismatch',
          message: 'Stored Infra state does not belong to the selected project and environment.',
        },
      ],
    };
  }
  return {
    ok: true,
    value: {
      environment: environment.value.id,
      outputs: request.previous?.outputs ?? [],
    },
    diagnostics: environment.diagnostics,
  };
}
