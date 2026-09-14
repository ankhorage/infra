import type { InfraCommandContext, ParsedInfraArguments } from '../../types/infraCli.js';

/*** Render one serializable command result in the requested human or compact JSON form. */
export function writeInfraStructured(
  context: InfraCommandContext,
  format: ParsedInfraArguments['format'],
  value: unknown,
): void {
  if (format === 'json') context.writeStdout(`${JSON.stringify(value)}\n`);
  else context.writeStdout(`${JSON.stringify(value, null, 2)}\n`);
}
