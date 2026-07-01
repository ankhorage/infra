import type {
  AnkhCapabilityId,
  AnkhCommandCategory,
  AnkhPackageMetadata,
} from '@ankhorage/contracts/cli';

import packageJson from '../package.json';

export const INFRA_PACKAGE_NAME = packageJson.name;
export const INFRA_PACKAGE_VERSION = packageJson.version;
export const INFRA_COMMAND_CATEGORY = 'infra' as const satisfies AnkhCommandCategory;
export const INFRA_CAPABILITIES = [
  'infra.validate',
  'infra.generate',
  'infra.status',
  'infra.up',
  'infra.down',
] as const satisfies readonly AnkhCapabilityId[];

export const INFRA_PACKAGE_METADATA = {
  category: INFRA_COMMAND_CATEGORY,
  provider: './dist/ankh.provider.js',
  capabilities: INFRA_CAPABILITIES,
} as const satisfies AnkhPackageMetadata;
