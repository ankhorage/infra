import type { InfraResourceIdentity } from '@ankhorage/contracts/infra';

/*** Create a stable collision-safe key for an Infra-owned resource. */
export function infraIdentityKey(identity: InfraResourceIdentity): string {
  return `${identity.projectId}\0${identity.environment}\0${identity.adapter}\0${identity.resourceId}`;
}
