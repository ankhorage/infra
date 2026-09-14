import type { InfraOutput } from '@ankhorage/contracts/infra';

import { mergeInfraOutputs } from './mergeInfraOutputs.js';

/*** Keep prior outputs not owned by adapters that returned a replacement snapshot. */
export function retainUnchangedAdapterOutputs(
  previous: readonly InfraOutput[],
  replacements: readonly InfraOutput[],
  replacedAdapters: ReadonlySet<string>,
): readonly InfraOutput[] {
  return mergeInfraOutputs(
    previous.filter(({ owner }) => !replacedAdapters.has(owner.adapter)),
    replacements,
  );
}
