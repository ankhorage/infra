import type {
  InfraCommandContext,
  InfraCommandRunResult,
  InfraCommandServices,
  RunInfraCommandImpl,
} from '../types/infraCli.js';
import { createDefaultInfraCommandContext } from './createDefaultInfraCommandContext.js';
import { findInfraCommand } from './findInfraCommand.js';
import { renderInfraRootHelp } from './renderInfraRootHelp.js';
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
    context.writeStdout(renderInfraRootHelp(context.version));
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

/*** Recognize standalone help tokens. */
function isHelpToken(value: string): boolean {
  return value === '--help' || value === '-h' || value === 'help';
}

/*** Recognize standalone version tokens. */
function isVersionToken(value: string): boolean {
  return value === '--version' || value === '-v' || value === 'version';
}
