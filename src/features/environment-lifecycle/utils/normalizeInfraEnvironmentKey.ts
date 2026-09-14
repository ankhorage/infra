/*** Convert arbitrary credential and secret identifiers into stable environment-variable segments. */
export function normalizeInfraEnvironmentKey(value: string): string {
  return value
    .replaceAll(/[^A-Za-z0-9]+/gu, '_')
    .replaceAll(/^_+|_+$/gu, '')
    .toUpperCase();
}
