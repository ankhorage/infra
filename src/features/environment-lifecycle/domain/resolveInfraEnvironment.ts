import { APP_ENVIRONMENT_IDS, type AppEnvironmentId } from '@ankhorage/contracts/environments';
import type { InfraResult } from '@ankhorage/contracts/infra';

import type {
  InfraEnvironmentResolutionRequest,
  ResolvedInfraEnvironment,
} from '../../../types/infraOrchestration.js';

/*** Resolve one explicitly configured environment while keeping local as the only safe default. */
export function resolveInfraEnvironment(
  request: InfraEnvironmentResolutionRequest,
): InfraResult<ResolvedInfraEnvironment> {
  if (request.operation === 'destroy' && request.environment === undefined) {
    return failure(
      'infra-environment-required',
      'Infra destroy requires an explicit --environment selection.',
    );
  }
  const environment = request.environment ?? 'local';
  if (!isAppEnvironmentId(environment)) {
    return failure(
      'infra-environment-invalid',
      `Unknown Infra environment "${environment}". Expected local, preview, or production.`,
    );
  }
  const desired = getEnvironment(request.manifest, environment);
  return desired === undefined
    ? failure(
        'infra-environment-unconfigured',
        `Infra environment "${environment}" is not configured.`,
      )
    : {
        ok: true,
        value: { id: environment, desired, manifest: request.manifest },
        diagnostics: [],
      };
}

/*** Read a closed environment key without an open object-injection boundary. */
function getEnvironment(
  manifest: InfraEnvironmentResolutionRequest['manifest'],
  environment: AppEnvironmentId,
) {
  switch (environment) {
    case 'local':
      return manifest.environments.local;
    case 'preview':
      return manifest.environments.preview;
    case 'production':
      return manifest.environments.production;
  }
}

/*** Narrow a CLI environment string through the canonical Contracts vocabulary. */
function isAppEnvironmentId(value: string): value is AppEnvironmentId {
  return APP_ENVIRONMENT_IDS.some((environment) => environment === value);
}

/*** Create a stable environment-resolution diagnostic. */
function failure(code: string, message: string): InfraResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, message }] };
}
