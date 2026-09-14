import type {
  InfraOperationRequest,
  InfraOrchestrationDependencies,
  InfraValidateOperationResult,
} from '../../../../types/infraOrchestration.js';
import { prepareInfraOperationAsync } from './prepareInfraOperationAsync.js';

/*** Validate one environment and every selected adapter without mutating infrastructure. */
export async function validateInfraEnvironmentAsync(
  request: InfraOperationRequest,
  dependencies: InfraOrchestrationDependencies,
): Promise<InfraValidateOperationResult> {
  const prepared = await prepareInfraOperationAsync(request, 'validate', dependencies);
  return prepared.ok
    ? {
        ok: true,
        value: { environment: prepared.value.environment.id },
        diagnostics: prepared.diagnostics,
      }
    : prepared;
}
