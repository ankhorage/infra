import type {
  InfraDiagnostic,
  InfraExecutionContext,
  InfraResult,
  InfraServiceAdapter,
  InfraWorkloadSpec,
} from '@ankhorage/contracts/infra';

import { appendInfraFailure } from '../../utils/appendInfraFailure.js';

/*** Collect each service workload graph once in deterministic adapter order. */
export async function collectInfraWorkloadsAsync(
  context: InfraExecutionContext,
  services: readonly InfraServiceAdapter[],
): Promise<InfraResult<readonly InfraWorkloadSpec[]>> {
  const workloads: InfraWorkloadSpec[] = [];
  const diagnostics: InfraDiagnostic[] = [];
  for (const service of services) {
    const desired = await service.desiredWorkloadsAsync(context);
    if (!desired.ok) return appendInfraFailure(diagnostics, desired);
    workloads.push(...desired.value);
    diagnostics.push(...desired.diagnostics);
  }
  return { ok: true, value: workloads, diagnostics };
}
