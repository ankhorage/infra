#!/usr/bin/env bun

import type { InfraCommandContext, InfraCommandRunResult } from './commandContext.js';
import { createDefaultCommandContext } from './commandContext.js';
import {
  findInfraCommandByStandaloneName,
  type InfraCommandServices,
  renderRootHelp,
  renderUnknownCommand,
  runInfraCommand,
  type RunInfraCommandImpl,
} from './commands.js';

export interface InfraCliOptions {
  readonly context?: InfraCommandContext;
  readonly runCommandImpl?: RunInfraCommandImpl;
  readonly services?: Partial<InfraCommandServices>;
}

export async function runCli(
  argv: readonly string[],
  options: InfraCliOptions = {},
): Promise<InfraCommandRunResult> {
  const context = options.context ?? createDefaultCommandContext();
  const runCommand = options.runCommandImpl ?? runInfraCommand;
  const [firstToken, ...restTokens] = argv;

  if (firstToken === undefined || isHelpToken(firstToken)) {
    context.writeStdout(renderRootHelp(context.version));
    return { exitCode: 0 };
  }

  if (isVersionToken(firstToken)) {
    context.writeStdout(`${context.version}\n`);
    return { exitCode: 0 };
  }

  const command = findInfraCommandByStandaloneName(firstToken);
  if (command === null) {
    context.writeStderr(renderUnknownCommand(firstToken));
    return { exitCode: 1 };
  }

  return runCommand(
    {
      argv: restTokens,
      command,
      context,
    },
    {
      services: options.services,
    },
  );
}

function isHelpToken(value: string): boolean {
  return value === '--help' || value === '-h' || value === 'help';
}

function isVersionToken(value: string): boolean {
  return value === '--version' || value === '-v' || value === 'version';
}

if (import.meta.main) {
  const result = await runCli(process.argv.slice(2));
  process.exit(result.exitCode);
}
