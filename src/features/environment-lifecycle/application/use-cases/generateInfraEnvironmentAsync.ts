import type { InfraDiagnostic } from '@ankhorage/contracts/infra';

import type {
  InfraGenerateOperationResult,
  InfraOperationRequest,
  InfraOrchestrationDependencies,
} from '../../../../types/infraOrchestration.js';
import { appendInfraFailure } from '../../utils/appendInfraFailure.js';
import { createInfraLedger } from '../../utils/createInfraLedger.js';
import { mergeInfraOutputs } from '../../utils/mergeInfraOutputs.js';
import { mergeInfraResources } from '../../utils/mergeInfraResources.js';
import { prepareInfraOperationAsync } from './prepareInfraOperationAsync.js';

/*** Generate deterministic review artifacts without mutating local or remote infrastructure. */
export async function generateInfraEnvironmentAsync(
  request: InfraOperationRequest,
  dependencies: InfraOrchestrationDependencies,
): Promise<InfraGenerateOperationResult> {
  const prepared = await prepareInfraOperationAsync(request, 'generate', dependencies);
  if (!prepared.ok) return prepared;
  const diagnostics: InfraDiagnostic[] = [...prepared.diagnostics];
  const { runtime } = prepared.value.adapters;
  const artifacts =
    runtime.generateAsync === undefined || prepared.value.runtimeDesired.targets.length === 0
      ? { ok: true as const, value: [], diagnostics: [] }
      : await runtime.generateAsync(prepared.value.context, prepared.value.runtimeDesired);
  if (!artifacts.ok) return appendInfraFailure(diagnostics, artifacts);
  diagnostics.push(...artifacts.diagnostics);
  return {
    ok: true,
    value: {
      environment: prepared.value.environment.id,
      artifacts: artifacts.value,
      ledger: createInfraLedger({
        projectId: request.projectId,
        environment: prepared.value.environment.id,
        targets:
          prepared.value.compute.targets.length > 0
            ? prepared.value.compute.targets
            : (request.previous?.targets ?? []),
        resources: mergeInfraResources(
          request.previous?.resources ?? [],
          prepared.value.compute.resources,
        ),
        outputs: mergeInfraOutputs(request.previous?.outputs ?? [], prepared.value.compute.outputs),
        artifacts: artifacts.value,
      }),
    },
    diagnostics,
  };
}
