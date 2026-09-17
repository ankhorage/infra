import type {
  InfraDiagnostic,
  InfraExecutionContext,
  InfraResult,
  InfraServiceAdapter,
} from '@ankhorage/contracts/infra';

import { appendInfraFailure } from '../../utils/appendInfraFailure.js';

/*** Run optional mutating service preparation before runtime workload materialization. */
export async function prepareInfraServicesAsync(
  context: InfraExecutionContext,
  services: readonly InfraServiceAdapter[],
): Promise<InfraResult<null>> {
  const diagnostics: InfraDiagnostic[] = [];
  for (const service of services) {
    if (service.prepareAsync === undefined) continue;
    const prepared = await service.prepareAsync(context);
    if (!prepared.ok) return appendInfraFailure(diagnostics, prepared);
    diagnostics.push(...prepared.diagnostics);
  }
  return { ok: true, value: null, diagnostics };
}
