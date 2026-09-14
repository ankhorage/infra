import type { InfraExecutionContext, InfraResult } from '@ankhorage/contracts/infra';

import { createInfraFailure } from '../../utils/createInfraFailure.js';
import { normalizeInfraEnvironmentKey } from '../../utils/normalizeInfraEnvironmentKey.js';

/*** Resolve execution-only control-plane credentials from exact-name or prefixed environment data. */
export function createEnvironmentInfraCredentialPort(
  environment: Readonly<Record<string, string | undefined>>,
): InfraExecutionContext['credentials'] {
  return {
    resolveAsync(reference) {
      const prefixedName = `ANKH_INFRA_CREDENTIAL_${normalizeInfraEnvironmentKey(reference.name)}`;
      const rawValue =
        Reflect.get(environment, reference.name) ?? Reflect.get(environment, prefixedName);
      if (rawValue === undefined || rawValue.length === 0) {
        return Promise.resolve(
          createInfraFailure(
            'infra-control-plane-credential-missing',
            `Control-plane credential ${reference.name} is unavailable. Set ${reference.name} or ${prefixedName}.`,
          ),
        );
      }
      return Promise.resolve(parseCredentialBundle(reference.name, rawValue));
    },
  };
}

/*** Parse JSON credential bundles; token variables also support their conventional scalar form. */
function parseCredentialBundle(
  name: string,
  rawValue: string,
): InfraResult<Readonly<Record<string, string>>> {
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (isRecord(parsed) && Object.values(parsed).every((value) => typeof value === 'string')) {
      return { ok: true, value: parsed as Readonly<Record<string, string>>, diagnostics: [] };
    }
  } catch {
    if (name.endsWith('_TOKEN')) {
      return { ok: true, value: { token: rawValue, apiToken: rawValue }, diagnostics: [] };
    }
  }
  return createInfraFailure(
    'infra-control-plane-credential-invalid',
    `Control-plane credential ${name} must be a JSON object containing string fields.`,
  );
}

/*** Narrow JSON credential bundles. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
