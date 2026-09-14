import type { InfraExecutionContext } from '@ankhorage/contracts/infra';

import { createInfraFailure } from '../../utils/createInfraFailure.js';
import { normalizeInfraEnvironmentKey } from '../../utils/normalizeInfraEnvironmentKey.js';

/*** Resolve explicitly addressed secret values from environment data without serializing them. */
export function createEnvironmentInfraSecretPort(
  environment: Readonly<Record<string, string | undefined>>,
): InfraExecutionContext['secrets'] {
  return {
    resolveAsync(reference) {
      const variable = [
        'ANKH_INFRA_SECRET',
        reference.projectId,
        reference.environment,
        reference.ref,
        reference.key,
      ]
        .map(normalizeInfraEnvironmentKey)
        .join('_');
      const value: unknown = Reflect.get(environment, variable);
      return Promise.resolve(
        typeof value !== 'string' || value.length === 0
          ? createInfraFailure(
              'infra-secret-unavailable',
              `Secret reference ${reference.ref}/${reference.key} is unavailable. Set ${variable}.`,
            )
          : { ok: true, value, diagnostics: [] },
      );
    },
  };
}
