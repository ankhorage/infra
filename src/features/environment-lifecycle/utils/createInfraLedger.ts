import type {
  InfraComputeTarget,
  InfraGeneratedArtifact,
  InfraLedger,
  InfraOutput,
  InfraOwnedResource,
} from '@ankhorage/contracts/infra';

/*** Create deterministic serializable lifecycle state without resolved credential or secret values. */
export function createInfraLedger(input: {
  readonly projectId: string;
  readonly environment: InfraLedger['environment'];
  readonly targets: readonly InfraComputeTarget[];
  readonly resources: readonly InfraOwnedResource[];
  readonly outputs: readonly InfraOutput[];
  readonly artifacts?: readonly InfraGeneratedArtifact[];
  readonly previous?: InfraLedger;
}): InfraLedger {
  const artifacts =
    input.artifacts?.map(({ owner, path }) => ({ owner, path })) ?? input.previous?.artifacts ?? [];
  return {
    schemaVersion: 1,
    projectId: input.projectId,
    environment: input.environment,
    targets: input.targets,
    resources: input.resources,
    outputs: input.outputs,
    artifacts,
  };
}
