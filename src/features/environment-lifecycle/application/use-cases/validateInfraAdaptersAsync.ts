import type {
  InfraDiagnostic,
  InfraExecutionContext,
  InfraResult,
} from '@ankhorage/contracts/infra';

import type { ResolvedInfraAdapters } from '../../../../types/infraOrchestration.js';
import { appendInfraFailure } from '../../utils/appendInfraFailure.js';

/*** Validate compute and service configuration before any mutating adapter call. */
export async function validateInfraAdaptersAsync(
  context: InfraExecutionContext,
  adapters: ResolvedInfraAdapters,
): Promise<InfraResult<null>> {
  const diagnostics: InfraDiagnostic[] = [];
  const compute = await adapters.compute.validateAsync(context, context.desired.deployment.compute);
  if (!compute.ok) return compute;
  diagnostics.push(...compute.diagnostics);
  for (const service of adapters.services) {
    const validation = await service.validateAsync(context);
    if (!validation.ok) return appendInfraFailure(diagnostics, validation);
    diagnostics.push(...validation.diagnostics);
  }
  return { ok: true, value: null, diagnostics };
}
