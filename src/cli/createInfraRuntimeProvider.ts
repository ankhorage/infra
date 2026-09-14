import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';

import {
  INFRA_CAPABILITIES,
  INFRA_COMMAND_CATEGORY,
  INFRA_PACKAGE_NAME,
  INFRA_PACKAGE_VERSION,
} from '../constants.js';
import type { CreateInfraRuntimeProviderOptions } from '../types/infraCli.js';
import { INFRA_COMMANDS } from './constants.js';
import { createProviderCommandDescriptors } from './createProviderCommandDescriptors.js';
import { runInfraCommandAsync } from './runInfraCommandAsync.js';

/*** Compose the canonical Infra command surface as an Ankh runtime provider. */
export function createInfraRuntimeProvider(
  options: CreateInfraRuntimeProviderOptions = {},
): AnkhRuntimeCommandProvider {
  const runCommandImpl = options.runCommandImpl ?? runInfraCommandAsync;
  return {
    id: INFRA_PACKAGE_NAME,
    category: INFRA_COMMAND_CATEGORY,
    version: INFRA_PACKAGE_VERSION,
    capabilities: [...INFRA_CAPABILITIES],
    commands: createProviderCommandDescriptors(),
    handlers: INFRA_COMMANDS.map((command) => ({
      path: command.path,
      handler(request) {
        return runCommandImpl(
          { argv: request.argv, command, context: request.context },
          { services: options.services },
        );
      },
    })),
  } satisfies AnkhRuntimeCommandProvider;
}
