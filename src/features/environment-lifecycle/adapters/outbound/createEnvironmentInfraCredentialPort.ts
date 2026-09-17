import type {
  InfraControlPlaneCredentialRef,
  InfraExecutionContext,
  InfraResult,
} from '@ankhorage/contracts/infra';

import { createInfraFailure } from '../../utils/createInfraFailure.js';
import { normalizeInfraEnvironmentKey } from '../../utils/normalizeInfraEnvironmentKey.js';

/*** Resolve execution-only control-plane credentials from exact-name or prefixed environment data. */
export function createEnvironmentInfraCredentialPort(
  environment: Readonly<Record<string, string | undefined>>,
): InfraExecutionContext['credentials'] {
  return {
    findAsync(reference) {
      return Promise.resolve(findCredential(environment, reference));
    },
    resolveAsync(reference) {
      const found = findCredential(environment, reference);
      if (!found.ok) return Promise.resolve(found);
      if (found.value !== null) {
        return Promise.resolve({ ok: true, value: found.value, diagnostics: found.diagnostics });
      }
      const prefixedName = prefixedCredentialName(reference.name);
      return Promise.resolve(
        createInfraFailure(
          'infra-control-plane-credential-missing',
          `Control-plane credential ${reference.name} is unavailable. Set ${reference.name} or ${prefixedName}.`,
        ),
      );
    },
    persistAsync(reference) {
      return Promise.resolve(
        createInfraFailure(
          'infra-control-plane-credential-persistence-unavailable',
          `Control-plane credential ${reference.name} cannot be persisted by the environment-only credential source.`,
        ),
      );
    },
  };
}

/*** Find and parse an optional credential bundle from the environment without treating absence as failure. */
function findCredential(
  environment: Readonly<Record<string, string | undefined>>,
  reference: InfraControlPlaneCredentialRef,
): InfraResult<Readonly<Record<string, string>> | null> {
  const prefixedName = prefixedCredentialName(reference.name);
  const rawValue = Reflect.get(environment, reference.name) ?? Reflect.get(environment, prefixedName);
  if (rawValue === undefined || rawValue.length === 0) {
    return { ok: true, value: null, diagnostics: [] };
  }
  return parseCredentialBundle(reference.name, rawValue);
}

/*** Build the canonical prefixed environment variable name for one credential reference. */
function prefixedCredentialName(name: string): string {
  return `ANKH_INFRA_CREDENTIAL_${normalizeInfraEnvironmentKey(name)}`;
}

/*** Parse JSON credential bundles; token variables also support their conventional scalar form. */
function parseCredentialBundle(
  name: string,
  rawValue: string,
): InfraResult<Readonly<Record<string, string>>> {
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (isStringRecord(parsed)) return { ok: true, value: parsed, diagnostics: [] };
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

/*** Narrow credential bundle values to a string-only record. */
function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}
