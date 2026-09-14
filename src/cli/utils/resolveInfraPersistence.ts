import type { InfraDestroyRequest, InfraLedger } from '@ankhorage/contracts/infra';

/*** Convert explicit owned-resource selectors into the canonical persistent deletion policy. */
export function resolveInfraPersistence(
  ledger: InfraLedger | undefined,
  resourceSelectors: readonly string[],
): InfraDestroyRequest['persistence'] {
  if (resourceSelectors.length === 0) return { policy: 'retain' };
  if (ledger === undefined) {
    throw new Error('Persistent deletion requires stored Infra ownership state.');
  }
  const confirmedResources = resourceSelectors.map((selector) => {
    const resource = ledger.resources.find(
      ({ identity }) => `${identity.adapter}:${identity.resourceId}` === selector,
    );
    if (!resource?.persistent) {
      throw new Error(`Persistent resource is not owned by this environment: ${selector}`);
    }
    return resource.identity;
  });
  return { policy: 'delete', confirmedResources };
}
