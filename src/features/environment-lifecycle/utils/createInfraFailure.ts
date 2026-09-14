import type { InfraResult } from '@ankhorage/contracts/infra';

/*** Create one sanitized provider-neutral Infra failure. */
export function createInfraFailure(code: string, message: string): InfraResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, message }] };
}
