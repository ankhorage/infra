import type { InfraDiagnostic, InfraResult } from '@ankhorage/contracts/infra';

/*** Preserve earlier safe diagnostics when a later lifecycle stage fails. */
export function appendInfraFailure(
  previous: readonly InfraDiagnostic[],
  failure: { readonly ok: false; readonly diagnostics: readonly InfraDiagnostic[] },
): InfraResult<never> {
  return { ok: false, diagnostics: [...previous, ...failure.diagnostics] };
}
