import type {
  InfraDiagnostic,
  InfraExecutionContext,
  InfraOutput,
  InfraOwnedResource,
  InfraResult,
  InfraServiceAdapter,
} from '@ankhorage/contracts/infra';

import type {
  InfraOrchestrationDependencies,
  InfraUpOperationResult,
  InfraUpRequest,
} from '../../../../types/infraOrchestration.js';
import { resolveInfraEnvironment } from '../../domain/resolveInfraEnvironment.js';
import { appendInfraFailure } from '../../utils/appendInfraFailure.js';
import { createInfraExecutionContext } from '../../utils/createInfraExecutionContext.js';
import { createInfraLedger } from '../../utils/createInfraLedger.js';
import { mergeInfraOutputs } from '../../utils/mergeInfraOutputs.js';
import { collectInfraWorkloadsAsync } from './collectInfraWorkloadsAsync.js';
import { prepareInfraServicesAsync } from './prepareInfraServicesAsync.js';
import { resolveInfraAdaptersAsync } from './resolveInfraAdaptersAsync.js';
import { validateInfraAdaptersAsync } from './validateInfraAdaptersAsync.js';

/*** Validate and reconcile compute, service preparation, workloads, runtime and services in order. */
export async function upInfraEnvironmentAsync(
  request: InfraUpRequest,
  dependencies: InfraOrchestrationDependencies,
): Promise<InfraUpOperationResult> {
  const environment = resolveInfraEnvironment({
    manifest: request.manifest,
    environment: request.environment,
    operation: 'up',
  });
  if (!environment.ok) return environment;
  const diagnostics: InfraDiagnostic[] = [...environment.diagnostics];
  const adapters = await resolveInfraAdaptersAsync(
    environment.value.desired,
    dependencies.adapterResolver,
  );
  if (!adapters.ok) return appendInfraFailure(diagnostics, adapters);
  diagnostics.push(...adapters.diagnostics);
  const context = createInfraExecutionContext(request, environment.value, dependencies);
  const validation = await validateInfraAdaptersAsync(context, adapters.value);
  if (!validation.ok) return appendInfraFailure(diagnostics, validation);
  diagnostics.push(...validation.diagnostics);
  const compute = await adapters.value.compute.ensureAsync(
    context,
    environment.value.desired.deployment.compute,
  );
  if (!compute.ok) return appendInfraFailure(diagnostics, compute);
  diagnostics.push(...compute.diagnostics);
  const preparation = await prepareInfraServicesAsync(context, adapters.value.services);
  if (!preparation.ok) return appendInfraFailure(diagnostics, preparation);
  diagnostics.push(...preparation.diagnostics);
  const workloads = await collectInfraWorkloadsAsync(context, adapters.value.services);
  if (!workloads.ok) return appendInfraFailure(diagnostics, workloads);
  diagnostics.push(...workloads.diagnostics);
  const runtimeDesired = {
    selection: environment.value.desired.deployment.runtime,
    targets: compute.value.targets,
    workloads: [...(environment.value.desired.workloads ?? []), ...workloads.value],
    availableOutputs: mergeInfraOutputs(request.previous?.outputs ?? [], compute.value.outputs),
  };
  const runtimeValidation = await adapters.value.runtime.validateAsync(context, runtimeDesired);
  if (!runtimeValidation.ok) return appendInfraFailure(diagnostics, runtimeValidation);
  diagnostics.push(...runtimeValidation.diagnostics);
  const runtime = await adapters.value.runtime.ensureAsync(context, runtimeDesired);
  if (!runtime.ok) return appendInfraFailure(diagnostics, runtime);
  diagnostics.push(...runtime.diagnostics);
  const services = await reconcileServicesAsync(context, adapters.value.services, [
    ...compute.value.outputs,
    ...runtime.value.outputs,
  ]);
  if (!services.ok) return appendInfraFailure(diagnostics, services);
  diagnostics.push(...services.diagnostics);
  const resources = [
    ...compute.value.resources,
    ...runtime.value.resources,
    ...services.value.resources,
  ];
  const outputs = mergeInfraOutputs(
    compute.value.outputs,
    runtime.value.outputs,
    services.value.outputs,
  );
  const ledger = createInfraLedger({
    projectId: request.projectId,
    environment: environment.value.id,
    targets: compute.value.targets,
    resources,
    outputs,
    previous: request.previous,
  });
  return {
    ok: true,
    value: {
      environment: environment.value.id,
      targets: compute.value.targets,
      resources,
      outputs,
      ledger,
    },
    diagnostics,
  };
}

/*** Reconcile service-owned external state after its runtime workloads expose outputs. */
async function reconcileServicesAsync(
  context: InfraExecutionContext,
  services: readonly InfraServiceAdapter[],
  runtimeOutputs: readonly InfraOutput[],
): Promise<
  InfraResult<{
    readonly resources: readonly InfraOwnedResource[];
    readonly outputs: readonly InfraOutput[];
  }>
> {
  const resources: InfraOwnedResource[] = [];
  const outputs: InfraOutput[] = [];
  const diagnostics: InfraDiagnostic[] = [];
  for (const service of services) {
    const result = await service.reconcileAsync(context, runtimeOutputs);
    if (!result.ok) return appendInfraFailure(diagnostics, result);
    resources.push(...result.value.resources);
    outputs.push(...result.value.outputs);
    diagnostics.push(...result.diagnostics);
  }
  return { ok: true, value: { resources, outputs }, diagnostics };
}
