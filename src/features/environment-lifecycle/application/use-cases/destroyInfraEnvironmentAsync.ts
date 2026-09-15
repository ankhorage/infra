import type {
  InfraDestroyRequest,
  InfraDiagnostic,
  InfraOutput,
  InfraOwnedResource,
  InfraResult,
} from '@ankhorage/contracts/infra';

import type {
  InfraDestroyOperationRequest,
  InfraDestroyOperationResult,
  InfraOrchestrationDependencies,
} from '../../../../types/infraOrchestration.js';
import { appendInfraFailure } from '../../utils/appendInfraFailure.js';
import { createInfraLedger } from '../../utils/createInfraLedger.js';
import { infraIdentityKey } from '../../utils/infraIdentityKey.js';
import { mergeInfraOutputs } from '../../utils/mergeInfraOutputs.js';
import { mergeInfraResources } from '../../utils/mergeInfraResources.js';
import { prepareInfraOperationAsync } from './prepareInfraOperationAsync.js';

/*** Destroy exact owned resources in reverse dependency order behind explicit scope confirmation. */
export async function destroyInfraEnvironmentAsync(
  request: InfraDestroyOperationRequest,
  dependencies: InfraOrchestrationDependencies,
): Promise<InfraDestroyOperationResult> {
  const prepared = await prepareInfraOperationAsync(request, 'destroy', dependencies);
  if (!prepared.ok) return prepared;
  const destroyRequest: InfraDestroyRequest = {
    projectId: request.projectId,
    environment: prepared.value.environment.id,
    confirmation: request.confirmation,
    persistence: request.persistence,
  };
  const safety = validateDestroyRequest(destroyRequest, request.previous?.resources ?? []);
  if (!safety.ok) return safety;
  const diagnostics: InfraDiagnostic[] = [...prepared.diagnostics];
  const resources: InfraOwnedResource[] = [];
  const outputs: InfraOutput[] = [];
  for (const service of [...prepared.value.adapters.services].reverse()) {
    const result = await service.destroyAsync(prepared.value.context, destroyRequest);
    if (!result.ok) return appendInfraFailure(diagnostics, result);
    resources.push(...result.value.resources);
    outputs.push(...result.value.outputs);
    diagnostics.push(...result.diagnostics);
  }
  let runtimeRetained = false;
  if (prepared.value.runtimeDesired.targets.length > 0) {
    const runtime = await prepared.value.adapters.runtime.destroyAsync(
      prepared.value.context,
      prepared.value.runtimeDesired,
      destroyRequest,
    );
    if (!runtime.ok) return appendInfraFailure(diagnostics, runtime);
    runtimeRetained = runtime.value.resources.length > 0;
    resources.push(...runtime.value.resources);
    outputs.push(...runtime.value.outputs);
    diagnostics.push(...runtime.diagnostics);
  }
  if (runtimeRetained) {
    resources.push(...prepared.value.compute.resources);
    outputs.push(...prepared.value.compute.outputs);
    diagnostics.push({
      severity: 'info',
      code: 'infra-compute-retained-for-runtime',
      message: 'Compute remains active because runtime-owned resources survived destruction.',
    });
  } else {
    const compute = await prepared.value.adapters.compute.destroyAsync(
      prepared.value.context,
      destroyRequest,
    );
    if (!compute.ok) return appendInfraFailure(diagnostics, compute);
    resources.push(...compute.value.resources);
    outputs.push(...compute.value.outputs);
    diagnostics.push(...compute.diagnostics);
  }
  const remainingResources = mergeInfraResources(resources);
  const remainingOutputs = mergeInfraOutputs(outputs);
  const ledger =
    remainingResources.length === 0 && remainingOutputs.length === 0
      ? null
      : createInfraLedger({
          projectId: request.projectId,
          environment: prepared.value.environment.id,
          targets: runtimeRetained ? prepared.value.compute.targets : [],
          resources: remainingResources,
          outputs: remainingOutputs,
        });
  return {
    ok: true,
    value: { environment: prepared.value.environment.id, ledger },
    diagnostics,
  };
}

/*** Refuse cross-project confirmation and unowned persistent deletion before any mutation. */
function validateDestroyRequest(
  request: InfraDestroyRequest,
  previous: readonly InfraOwnedResource[],
): InfraResult<null> {
  if (
    request.confirmation.projectId !== request.projectId ||
    request.confirmation.environment !== request.environment
  ) {
    return destroyFailure(
      'infra-destroy-confirmation-mismatch',
      'Infra destroy confirmation must exactly match the selected project and environment.',
    );
  }
  if (request.persistence.policy === 'retain') {
    return { ok: true, value: null, diagnostics: [] };
  }
  const owned = new Set(previous.map(({ identity }) => infraIdentityKey(identity)));
  const invalid = request.persistence.confirmedResources.some(
    (identity) =>
      identity.projectId !== request.projectId ||
      identity.environment !== request.environment ||
      !owned.has(infraIdentityKey(identity)),
  );
  return invalid
    ? destroyFailure(
        'infra-destroy-resource-unowned',
        'Persistent deletion confirmation contains a resource outside the stored Infra scope.',
      )
    : { ok: true, value: null, diagnostics: [] };
}

/*** Create one stable non-provider-specific destroy safety failure. */
function destroyFailure(code: string, message: string): InfraResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, message }] };
}
