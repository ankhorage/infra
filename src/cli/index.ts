import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';

import {
  createProviderCommandDescriptors,
  INFRA_COMMANDS,
  type InfraCommandServices,
  runInfraCommand,
  type RunInfraCommandImpl,
} from '../commands.js';
import {
  INFRA_CAPABILITIES,
  INFRA_COMMAND_CATEGORY,
  INFRA_PACKAGE_NAME,
  INFRA_PACKAGE_VERSION,
} from '../packageMetadata.js';

export interface CreateInfraRuntimeProviderOptions {
  readonly runCommandImpl?: RunInfraCommandImpl;
  readonly services?: Partial<InfraCommandServices>;
}

export function createInfraRuntimeProvider(
  options: CreateInfraRuntimeProviderOptions = {},
): AnkhRuntimeCommandProvider {
  const runCommandImpl = options.runCommandImpl ?? runInfraCommand;

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
          {
            argv: request.argv,
            command,
            context: request.context,
          },
          {
            services: options.services,
          },
        );
      },
    })),
  } satisfies AnkhRuntimeCommandProvider;
}

const provider = createInfraRuntimeProvider();

export default provider;
