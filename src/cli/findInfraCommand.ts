import type { InfraCommandDefinition } from '../types/infraCli.js';
import { INFRA_COMMANDS } from './constants.js';

/*** Resolve one exact standalone Infra command name without guessing intent. */
export function findInfraCommand(value: string): InfraCommandDefinition | null {
  return INFRA_COMMANDS.find((candidate) => candidate.standaloneName === value) ?? null;
}
