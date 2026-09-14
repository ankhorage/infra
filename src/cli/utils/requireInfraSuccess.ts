import type { InfraDiagnostic, InfraResult } from '@ankhorage/contracts/infra';

import type { InfraCommandContext } from '../../types/infraCli.js';

/*** Emit diagnostics and narrow a provider-neutral result before command rendering continues. */
export function requireInfraSuccess<T>(
  result: InfraResult<T>,
  context: InfraCommandContext,
): asserts result is Extract<InfraResult<T>, { readonly ok: true }> {
  writeDiagnostics(context, result.diagnostics);
  if (!result.ok) throw new Error(result.diagnostics.map(({ message }) => message).join(' '));
}

/*** Render diagnostics to the matching process channel without provider-specific formatting. */
function writeDiagnostics(
  context: InfraCommandContext,
  diagnostics: readonly InfraDiagnostic[],
): void {
  for (const diagnostic of diagnostics) {
    const line = `${diagnostic.severity}: ${diagnostic.code}: ${diagnostic.message}\n`;
    if (diagnostic.severity === 'info') context.writeStdout(line);
    else context.writeStderr(line);
  }
}
