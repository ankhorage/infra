import type { AnkhCommandCategory, AnkhPackageMetadata } from '@ankhorage/contracts/cli';

import packageJson from '../package.json';
import { CAPABILITIES } from './capabilities/index.js';

export const INFRA_PACKAGE_NAME = packageJson.name;
export const INFRA_PACKAGE_VERSION = packageJson.version;
export const INFRA_PACKAGE_DESCRIPTION = packageJson.description;
export const INFRA_COMMAND_CATEGORY = 'infra' as const satisfies AnkhCommandCategory;
export const INFRA_PACKAGE_METADATA = {
  category: INFRA_COMMAND_CATEGORY,
  provider: './dist/cli/index.js',
  capabilities: CAPABILITIES,
} as const satisfies AnkhPackageMetadata;
