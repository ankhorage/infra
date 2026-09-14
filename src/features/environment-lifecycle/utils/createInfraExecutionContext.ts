import type { InfraExecutionContext } from '@ankhorage/contracts/infra';

import type {
  InfraOperationRequest,
  InfraOrchestrationDependencies,
  ResolvedInfraEnvironment,
} from '../../../types/infraOrchestration.js';

/*** Create one execution context without copying resolved secret values into serializable state. */
export function createInfraExecutionContext(
  request: InfraOperationRequest,
  environment: ResolvedInfraEnvironment,
  dependencies: InfraOrchestrationDependencies,
): InfraExecutionContext {
  return {
    projectId: request.projectId,
    environment: environment.id,
    desired: environment.desired,
    ...(request.previous === undefined ? {} : { previous: request.previous }),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
    credentials: dependencies.credentials,
    secrets: dependencies.secrets,
  };
}
