import type { InfraOutput } from '@ankhorage/contracts/infra';

import type { InfraCommandContext } from '../../types/infraCli.js';

/*** Print public environment-variable outputs while keeping secret values as references. */
export function writeInfraEnvironmentOutputs(
  context: InfraCommandContext,
  outputs: readonly InfraOutput[],
): void {
  for (const output of outputs) {
    if (output.visibility === 'public' && output.environmentVariable !== undefined) {
      context.writeStdout(`${output.environmentVariable}=${quoteEnvironmentValue(output.value)}\n`);
    } else if (output.visibility === 'secret') {
      context.writeStderr(
        `Secret output ${output.owner.adapter}/${output.owner.resourceId}/${output.name} remains a reference and was not printed.\n`,
      );
    }
  }
}

/*** Quote one scalar value for portable shell environment consumption. */
function quoteEnvironmentValue(value: string | number | boolean): string {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
