import { INFRA_COMMAND_CATEGORY } from '../constants.js';
import { INFRA_COMMANDS } from './constants.js';

/*** Render the standalone Infra command surface and environment safety rules. */
export function renderInfraRootHelp(version: string): string {
  const commands = INFRA_COMMANDS.map(
    ({ standaloneName, summary }) => `  ${standaloneName.padEnd(8, ' ')} ${summary}`,
  ).join('\n');
  return [
    `@ankhorage/infra v${version}`,
    '',
    'Usage:',
    '  ankhorage-infra <command> [project] [--environment <environment>]',
    `  ankh ${INFRA_COMMAND_CATEGORY} <command> [project] [--environment <environment>]`,
    '',
    'Commands:',
    commands,
    '',
    'Safety:',
    '  local is the only implicit environment; destroy always requires --environment and --confirm.',
    '',
  ].join('\n');
}
