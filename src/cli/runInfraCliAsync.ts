import { isHelpToken, renderProviderHelp } from '@ankhorage/ankh';

import { INFRA_PACKAGE_DESCRIPTION } from '../constants.js';
import type {
  InfraCommandContext,
  InfraCommandRunResult,
  InfraCommandServices,
  RunInfraCommandImpl,
} from '../types/infraCli.js';
import { createDefaultInfraCommandContext } from './createDefaultInfraCommandContext.js';
import { createInfraRuntimeProvider } from './createInfraRuntimeProvider.js';
import { findInfraCommand } from './findInfraCommand.js';
import { renderUnknownInfraCommand } from './renderUnknownInfraCommand.js';
import { runInfraCommandAsync } from './runInfraCommandAsync.js';

/*** Dispatch the standalone executable arguments through the canonical Infra command surface. */
export async function runInfraCliAsync(
  argv: readonly string[],
  options: InfraCliOptions = {},
): Promise<InfraCommandRunResult> {
  const context = options.context ?? createDefaultInfraCommandContext();
  const runCommand = options.runCommandImpl ?? runInfraCommandAsync;
  const [firstToken, ...restTokens] = argv;
  if (firstToken === undefined || isHelpToken(firstToken)) {
    context.writeStdout(
      renderProviderHelp({
        commandPrefix: ['ankhorage-infra'],
        description: INFRA_PACKAGE_DESCRIPTION,
        manifest: createInfraRuntimeProvider(),
      }),
    );
    return { exitCode: 0 };
  }
  if (isVersionToken(firstToken)) {
    context.writeStdout(`${context.version}\n`);
    return { exitCode: 0 };
  }
  const command = findInfraCommand(firstToken);
  if (command === null) {
    context.writeStderr(renderUnknownInfraCommand(firstToken));
    return { exitCode: 1 };
  }
  return runCommand({ argv: restTokens, command, context }, { services: options.services });
}

interface InfraCliOptions {
  readonly context?: InfraCommandContext;
  readonly runCommandImpl?: RunInfraCommandImpl;
  readonly services?: Partial<InfraCommandServices>;
}

/*** Recognize standalone version tokens. */
function isVersionToken(value: string): boolean {
  return value === '--version' || value === '-v' || value === 'version';
}
