import { APP_ENVIRONMENT_IDS } from '@ankhorage/contracts/environments';

import { INFRA_COMMAND_CATEGORY } from '../constants.js';
import { createInfraCommandServices } from '../features/environment-lifecycle/composition/createInfraCommandServices.js';
import type {
  InfraCommandDefinition,
  InfraCommandInvocation,
  InfraCommandRunResult,
  ParsedInfraArguments,
  RunInfraCommandOptions,
} from '../types/infraCli.js';

/*** Run one standalone or provider-backed Infra command through the shared typed lifecycle. */
export async function runInfraCommandAsync(
  request: InfraCommandInvocation,
  options: RunInfraCommandOptions = {},
): Promise<InfraCommandRunResult> {
  const services = createInfraCommandServices(options.services);
  try {
    const parsed = parseCommandArguments(request.command, request.argv);
    if (parsed === null) {
      request.context.writeStdout(renderCommandHelp(request.command));
      return { exitCode: 0 };
    }
    return await request.command.run({ context: request.context, arguments: parsed }, services);
  } catch (error) {
    request.context.writeStderr(
      `Infra ${request.command.standaloneName} failed: ${getErrorMessage(error)}\n`,
    );
    return { exitCode: 1 };
  }
}

/*** Parse the common project, environment, output and destruction options. */
function parseCommandArguments(
  commandDefinition: InfraCommandDefinition,
  argv: readonly string[],
): ParsedInfraArguments | null {
  if (argv.length === 1 && isHelpToken(argv.at(0))) return null;
  let projectId: string | undefined;
  let environment: ParsedInfraArguments['environment'];
  let format: ParsedInfraArguments['format'] = 'human';
  let confirmation: string | undefined;
  const deleteResources: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv.at(index);
    if (token === '--environment') {
      environment = parseEnvironment(readOptionValue(argv, ++index, token));
    } else if (token === '--format') {
      format = parseFormat(readOptionValue(argv, ++index, token));
    } else if (token === '--confirm') {
      confirmation = readOptionValue(argv, ++index, token);
    } else if (token === '--delete-resource') {
      deleteResources.push(readOptionValue(argv, ++index, token));
    } else if (token?.startsWith('-') === true) {
      throw new Error(`Unknown Infra ${commandDefinition.standaloneName} option: ${token}`);
    } else if (projectId === undefined && token !== undefined) {
      projectId = token;
    } else {
      throw new Error(
        `Infra ${commandDefinition.standaloneName} accepts at most one project argument.`,
      );
    }
  }
  if (format === 'env' && commandDefinition.standaloneName !== 'outputs') {
    throw new Error('--format env is supported only by Infra outputs.');
  }
  if (commandDefinition.standaloneName === 'destroy' && environment === undefined) {
    throw new Error('Infra destroy requires --environment <local|preview|production>.');
  }
  return { projectId, environment, format, confirmation, deleteResources };
}

/*** Parse one environment identifier against the canonical closed set. */
function parseEnvironment(value: string): ParsedInfraArguments['environment'] {
  const environment = APP_ENVIRONMENT_IDS.find((candidate) => candidate === value);
  if (environment === undefined) throw new Error(`Unknown Infra environment: ${value}.`);
  return environment;
}

/*** Parse the supported command output formats. */
function parseFormat(value: string): ParsedInfraArguments['format'] {
  if (value === 'human' || value === 'json' || value === 'env') return value;
  throw new Error(`Unknown Infra output format: ${value}.`);
}

/*** Read one required CLI option value. */
function readOptionValue(argv: readonly string[], index: number, option: string): string {
  const value = argv.at(index);
  if (value === undefined || value.startsWith('-')) throw new Error(`${option} requires a value.`);
  return value;
}

/*** Render command-specific standalone and provider usage. */
function renderCommandHelp(commandDefinition: InfraCommandDefinition): string {
  return [
    commandDefinition.summary,
    '',
    'Usage:',
    `  ankhorage-infra ${commandDefinition.standaloneName} [project] [--environment <environment>]`,
    `  ankh ${INFRA_COMMAND_CATEGORY} ${commandDefinition.path.join(' ')} [project] [--environment <environment>]`,
    '',
  ].join('\n');
}

/*** Normalize arbitrary command failures for the CLI boundary. */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/*** Recognize the command-local help tokens. */
function isHelpToken(value: string | undefined): boolean {
  return value === '--help' || value === '-h' || value === 'help';
}
