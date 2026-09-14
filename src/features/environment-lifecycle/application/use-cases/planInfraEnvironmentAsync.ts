import type { InfraDiagnostic, InfraPlanAction } from '@ankhorage/contracts/infra';

import type {
  InfraOperationRequest,
  InfraOrchestrationDependencies,
  InfraPlanOperationResult,
} from '../../../../types/infraOrchestration.js';
import { orderInfraPlanActions } from '../../domain/orderInfraPlanActions.js';
import { appendInfraFailure } from '../../utils/appendInfraFailure.js';
import { prepareInfraOperationAsync } from './prepareInfraOperationAsync.js';

/*** Aggregate a side-effect-free dependency-ordered plan from all selected adapters. */
export async function planInfraEnvironmentAsync(
  request: InfraOperationRequest,
  dependencies: InfraOrchestrationDependencies,
): Promise<InfraPlanOperationResult> {
  const prepared = await prepareInfraOperationAsync(request, 'plan', dependencies);
  if (!prepared.ok) return prepared;
  const diagnostics: InfraDiagnostic[] = [...prepared.diagnostics];
  const actions: InfraPlanAction[] = [];
  const compute = await prepared.value.adapters.compute.planAsync(
    prepared.value.context,
    prepared.value.environment.desired.deployment.compute,
  );
  if (!compute.ok) return appendInfraFailure(diagnostics, compute);
  actions.push(...compute.value);
  diagnostics.push(...compute.diagnostics);
  if (prepared.value.runtimeDesired.targets.length === 0) {
    actions.push({
      owner: {
        projectId: request.projectId,
        environment: prepared.value.environment.id,
        adapter: prepared.value.adapters.runtime.descriptor.id,
        resourceId: 'runtime',
      },
      operation: 'create',
      impact: 'none',
      detail: 'Runtime planning is deferred until the planned compute target exists.',
      dependsOn: compute.value.map(({ owner }) => owner),
    });
  } else {
    const runtime = await prepared.value.adapters.runtime.planAsync(
      prepared.value.context,
      prepared.value.runtimeDesired,
    );
    if (!runtime.ok) return appendInfraFailure(diagnostics, runtime);
    actions.push(...runtime.value);
    diagnostics.push(...runtime.diagnostics);
  }
  for (const service of prepared.value.adapters.services) {
    const plan = await service.planAsync(prepared.value.context);
    if (!plan.ok) return appendInfraFailure(diagnostics, plan);
    actions.push(...plan.value);
    diagnostics.push(...plan.diagnostics);
  }
  const ordered = orderInfraPlanActions(actions);
  if (!ordered.ok) return appendInfraFailure(diagnostics, ordered);
  return {
    ok: true,
    value: {
      projectId: request.projectId,
      environment: prepared.value.environment.id,
      actions: ordered.value,
    },
    diagnostics,
  };
}
