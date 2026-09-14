import type { InfraOutput } from '@ankhorage/contracts/infra';

import { infraIdentityKey } from './infraIdentityKey.js';

/*** Merge output identities while preferring the last adapter result for each owner and name. */
export function mergeInfraOutputs(
  ...groups: readonly (readonly InfraOutput[])[]
): readonly InfraOutput[] {
  const outputs = new Map<string, InfraOutput>();
  for (const output of groups.flat()) {
    outputs.set(`${infraIdentityKey(output.owner)}\0${output.name}`, output);
  }
  return [...outputs.values()];
}
