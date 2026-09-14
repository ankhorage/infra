import type { InfraOwnedResource } from '@ankhorage/contracts/infra';

import { infraIdentityKey } from './infraIdentityKey.js';

/*** Merge resource identities while preferring the last adapter result for each owner. */
export function mergeInfraResources(
  ...groups: readonly (readonly InfraOwnedResource[])[]
): readonly InfraOwnedResource[] {
  const resources = new Map<string, InfraOwnedResource>();
  for (const resource of groups.flat()) {
    resources.set(infraIdentityKey(resource.identity), resource);
  }
  return [...resources.values()];
}
