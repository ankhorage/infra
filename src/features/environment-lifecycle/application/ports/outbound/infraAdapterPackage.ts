import type { InfraAdapterDescriptor } from '@ankhorage/contracts/infra';

export interface InfraAdapterPackageResolver {
  loadAsync(packageName: string): Promise<unknown>;
}

export interface InfraAdapterPackageModule {
  readonly infraAdapterDescriptor: InfraAdapterDescriptor;
  readonly createInfraAdapter: () => unknown;
}
