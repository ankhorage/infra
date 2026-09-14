import type { InfraDiagnostic, InfraResourceStatus } from '@ankhorage/contracts/infra';

import type {
  InfraOperationRequest,
  InfraOrchestrationDependencies,
  InfraStatusOperationResult,
} from '../../../../types/infraOrchestration.js';
import { appendInfraFailure } from '../../utils/appendInfraFailure.js';
import { prepareInfraOperationAsync } from './prepareInfraOperationAsync.js';

/*** Aggregate provider-neutral compute, runtime and service status. */
export async function statusInfraEnvironmentAsync(
  request: InfraOperationRequest,
  dependencies: InfraOrchestrationDependencies,
): Promise<InfraStatusOperationResult> {
  const prepared = await prepareInfraOperationAsync(request, 'status', dependencies);
  if (!prepared.ok) return prepared;
  const diagnostics: InfraDiagnostic[] = [...prepared.diagnostics];
  const resources: InfraResourceStatus[] = [];
  const compute = await prepared.value.adapters.compute.statusAsync(prepared.value.context);
  if (!compute.ok) return appendInfraFailure(diagnostics, compute);
  resources.push(...compute.value);
  diagnostics.push(...compute.diagnostics);
  if (prepared.value.runtimeDesired.targets.length === 0) {
    resources.push({
      owner: {
        projectId: request.projectId,
        environment: prepared.value.environment.id,
        adapter: prepared.value.adapters.runtime.descriptor.id,
        resourceId: 'runtime',
      },
      state: 'absent',
      detail: 'Compute has not exposed a portable runtime target.',
    });
  } else {
    const runtime = await prepared.value.adapters.runtime.statusAsync(
      prepared.value.context,
      prepared.value.runtimeDesired,
    );
    if (!runtime.ok) return appendInfraFailure(diagnostics, runtime);
    resources.push(...runtime.value);
    diagnostics.push(...runtime.diagnostics);
  }
  for (const service of prepared.value.adapters.services) {
    const status = await service.statusAsync(prepared.value.context);
    if (!status.ok) return appendInfraFailure(diagnostics, status);
    resources.push(...status.value);
    diagnostics.push(...status.diagnostics);
  }
  return {
    ok: true,
    value: {
      projectId: request.projectId,
      environment: prepared.value.environment.id,
      state: aggregateInfraStatus(resources),
      resources,
    },
    diagnostics,
  };
}

/*** Select the most actionable canonical status, treating an empty environment as absent. */
function aggregateInfraStatus(
  resources: readonly InfraResourceStatus[],
): InfraResourceStatus['state'] {
  if (resources.length === 0) return 'absent';
  const severity: readonly InfraResourceStatus['state'][] = [
    'failed',
    'degraded',
    'pending',
    'unknown',
    'stopped',
    'retained',
    'absent',
    'ready',
  ];
  return (
    severity.find((state) => resources.some((resource) => resource.state === state)) ?? 'unknown'
  );
}
