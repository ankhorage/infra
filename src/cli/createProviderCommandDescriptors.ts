import type { AnkhCommandDescriptor } from '@ankhorage/contracts/cli';

import { INFRA_COMMANDS } from './constants.js';

/*** Expose the same eight commands through Ankh provider discovery. */
export function createProviderCommandDescriptors(): readonly AnkhCommandDescriptor[] {
  return INFRA_COMMANDS.map(({ capability, path, summary }) => ({ capability, path, summary }));
}
