import type { InfraDiagnostic, InfraOutput, InfraOwnedResource } from '@ankhorage/contracts/infra';

import type {
  InfraDownOperationResult,
  InfraOperationRequest,
  InfraOrchestrationDependencies,
} from '../../../../types/infraOrchestration.js';
import { appendInfraFailure } from '../../utils/appendInfraFailure.js';
import { createInfraLedger } from '../../utils/createInfraLedger.js';
import { retainUnchangedAdapterOutputs } from '../../utils/retainUnchangedAdapterOutputs.js';
import { retainUnchangedAdapterResources } from '../../utils/retainUnchangedAdapterResources.js';
import { prepareInfraOperationAsync } from './prepareInfraOperationAsync.js';

/*** Reversibly suspend services and runtime while retaining compute and persistent data. */
export async function downInfraEnvironmentAsync(
  request: InfraOperationRequest,
  dependencies: InfraOrchestrationDependencies,
): Promise<InfraDownOperationResult> {
  const prepared = await prepareInfraOperationAsync(request, 'down', dependencies);
  if (!prepared.ok) return prepared;
  const diagnostics: InfraDiagnostic[] = [...prepared.diagnostics];
  const resources: InfraOwnedResource[] = [];
  const outputs: InfraOutput[] = [];
  const replacedAdapters = new Set<string>();
  for (const service of [...prepared.value.adapters.services].reverse()) {
    if (service.suspendAsync === undefined) continue;
    const result = await service.suspendAsync(prepared.value.context);
    if (!result.ok) return appendInfraFailure(diagnostics, result);
    replacedAdapters.add(service.descriptor.id);
    resources.push(...result.value.resources);
    outputs.push(...result.value.outputs);
    diagnostics.push(...result.diagnostics);
  }
  if (prepared.value.runtimeDesired.targets.length > 0) {
    const runtime = await prepared.value.adapters.runtime.suspendAsync(
      prepared.value.context,
      prepared.value.runtimeDesired,
    );
    if (!runtime.ok) return appendInfraFailure(diagnostics, runtime);
    replacedAdapters.add(prepared.value.adapters.runtime.descriptor.id);
    resources.push(...runtime.value.resources);
    outputs.push(...runtime.value.outputs);
    diagnostics.push(...runtime.diagnostics);
  }
  const previousResources = request.previous?.resources ?? [];
  const previousOutputs = request.previous?.outputs ?? [];
  return {
    ok: true,
    value: {
      environment: prepared.value.environment.id,
      ledger: createInfraLedger({
        projectId: request.projectId,
        environment: prepared.value.environment.id,
        targets:
          prepared.value.compute.targets.length > 0
            ? prepared.value.compute.targets
            : (request.previous?.targets ?? []),
        resources: retainUnchangedAdapterResources(previousResources, resources, replacedAdapters),
        outputs: retainUnchangedAdapterOutputs(previousOutputs, outputs, replacedAdapters),
        previous: request.previous,
      }),
    },
    diagnostics,
  };
}
