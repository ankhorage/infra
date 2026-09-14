import type { InfraDiagnostic, InfraResult } from '@ankhorage/contracts/infra';

import type {
  InfraOperationRequest,
  InfraOrchestrationDependencies,
  PreparedInfraOperation,
} from '../../../../types/infraOrchestration.js';
import { resolveInfraEnvironment } from '../../domain/resolveInfraEnvironment.js';
import { appendInfraFailure } from '../../utils/appendInfraFailure.js';
import { createInfraExecutionContext } from '../../utils/createInfraExecutionContext.js';
import { collectInfraWorkloadsAsync } from './collectInfraWorkloadsAsync.js';
import { resolveInfraAdaptersAsync } from './resolveInfraAdaptersAsync.js';
import { validateInfraAdaptersAsync } from './validateInfraAdaptersAsync.js';

/*** Resolve and validate one operation without creating, updating or deleting infrastructure. */
export async function prepareInfraOperationAsync(
  request: InfraOperationRequest,
  operation: 'validate' | 'plan' | 'generate' | 'status' | 'outputs' | 'down' | 'destroy',
  dependencies: InfraOrchestrationDependencies,
): Promise<InfraResult<PreparedInfraOperation>> {
  const diagnostics: InfraDiagnostic[] = [];
  const environment = resolveInfraEnvironment({
    manifest: request.manifest,
    environment: request.environment,
    operation,
  });
  if (!environment.ok) return environment;
  diagnostics.push(...environment.diagnostics);
  if (
    request.previous !== undefined &&
    request.previousDesired !== undefined &&
    !hasSameProviderSelection(request.previousDesired, environment.value.desired)
  ) {
    return {
      ok: false,
      diagnostics: [
        ...diagnostics,
        {
          severity: 'error',
          code: 'infra-provider-selection-changed',
          message:
            'Stored Infra resources use another provider selection. Destroy that environment before applying the new selection.',
        },
      ],
    };
  }
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
  const workloads = await collectInfraWorkloadsAsync(context, adapters.value.services);
  if (!workloads.ok) return appendInfraFailure(diagnostics, workloads);
  diagnostics.push(...workloads.diagnostics);
  const compute = await adapters.value.compute.inspectAsync(
    context,
    environment.value.desired.deployment.compute,
  );
  if (!compute.ok) return appendInfraFailure(diagnostics, compute);
  diagnostics.push(...compute.diagnostics);
  const runtimeDesired = {
    selection: environment.value.desired.deployment.runtime,
    targets:
      compute.value.targets.length > 0
        ? compute.value.targets
        : (request.previous?.targets ?? compute.value.targets),
    workloads: [...(environment.value.desired.workloads ?? []), ...workloads.value],
    availableOutputs: mergeOutputs(request.previous?.outputs ?? [], compute.value.outputs),
  };
  if (runtimeDesired.targets.length === 0) {
    diagnostics.push({
      severity: 'info',
      code: 'infra-runtime-target-deferred',
      message: 'Runtime validation is deferred until compute exposes a portable target.',
    });
  } else {
    const runtime = await adapters.value.runtime.validateAsync(context, runtimeDesired);
    if (!runtime.ok) return appendInfraFailure(diagnostics, runtime);
    diagnostics.push(...runtime.diagnostics);
  }
  return {
    ok: true,
    value: {
      environment: environment.value,
      context,
      adapters: adapters.value,
      compute: compute.value,
      runtimeDesired,
    },
    diagnostics,
  };
}

/*** Compare provider identity only; configuration changes remain normal in-place reconciliation. */
function hasSameProviderSelection(
  previous: PreparedInfraOperation['environment']['desired'],
  current: PreparedInfraOperation['environment']['desired'],
): boolean {
  return providerSelection(previous).join('\0') === providerSelection(current).join('\0');
}

/*** Read the closed provider slots in stable capability order. */
function providerSelection(
  desired: PreparedInfraOperation['environment']['desired'],
): readonly (string | undefined)[] {
  return [
    desired.deployment.compute.provider,
    desired.deployment.runtime.provider,
    desired.database?.provider,
    desired.objectStorage?.provider,
    desired.auth?.provider,
    desired.authz?.provider,
    desired.secretStore?.provider,
  ];
}

/*** Prefer freshly inspected outputs while preserving unrelated safe prior values. */
function mergeOutputs(
  previous: PreparedInfraOperation['runtimeDesired']['availableOutputs'],
  current: PreparedInfraOperation['runtimeDesired']['availableOutputs'],
): PreparedInfraOperation['runtimeDesired']['availableOutputs'] {
  const currentKeys = new Set(current.map(outputKey));
  return [...previous.filter((output) => !currentKeys.has(outputKey(output))), ...current];
}

/*** Create one stable public-or-secret output identity without reading its value. */
function outputKey(
  output: PreparedInfraOperation['runtimeDesired']['availableOutputs'][number],
): string {
  const { owner } = output;
  return `${owner.projectId}\0${owner.environment}\0${owner.adapter}\0${owner.resourceId}\0${output.name}`;
}
