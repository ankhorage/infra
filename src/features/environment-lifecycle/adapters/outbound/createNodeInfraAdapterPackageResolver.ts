import type { InfraAdapterPackageResolver } from '../../application/ports/outbound/infraAdapterPackage.js';

/*** Load only a catalog-selected package through the host module resolver. */
export function createNodeInfraAdapterPackageResolver(): InfraAdapterPackageResolver {
  return {
    loadAsync(packageName) {
      return import(packageName);
    },
  };
}
