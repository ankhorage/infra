import type { InfraOwnedResource } from '@ankhorage/contracts/infra';

import { mergeInfraResources } from './mergeInfraResources.js';

/*** Keep prior resources not owned by adapters that returned a replacement snapshot. */
export function retainUnchangedAdapterResources(
  previous: readonly InfraOwnedResource[],
  replacements: readonly InfraOwnedResource[],
  replacedAdapters: ReadonlySet<string>,
): readonly InfraOwnedResource[] {
  return mergeInfraResources(
    previous.filter(({ identity }) => !replacedAdapters.has(identity.adapter)),
    replacements,
  );
}
