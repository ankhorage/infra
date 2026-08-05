export type AuthRedirectEnvironment = 'local' | 'preview' | 'production';

export interface ResolveAuthRedirectConfigurationInput {
  environment: AuthRedirectEnvironment;
  gatewayOrigin: string;
  siteOrigin: string;
  callbackRoute: string;
  webOrigins?: readonly string[];
  nativeRedirectUris?: readonly string[];
}

export interface AuthRedirectConfiguration {
  providerCallbackUrl: string;
  siteUrl: string;
  redirectAllowList: readonly string[];
  serializedRedirectAllowList: string;
}

export function resolveAuthRedirectConfiguration(
  input: ResolveAuthRedirectConfigurationInput,
): AuthRedirectConfiguration {
  const gatewayOrigin = normalizeWebOrigin(input.gatewayOrigin, 'gatewayOrigin');
  const siteUrl = normalizeWebOrigin(input.siteOrigin, 'siteOrigin');
  const callbackRoute = normalizeCallbackRoute(input.callbackRoute);
  const webOrigins = unique([
    siteUrl,
    ...(input.webOrigins ?? []).map((origin) => normalizeWebOrigin(origin, 'webOrigins')),
  ]);
  const nativeRedirectUris = unique(
    (input.nativeRedirectUris ?? []).map((uri) => normalizeNativeRedirectUri(uri)),
  );

  const redirectAllowList = unique([
    ...webOrigins,
    ...webOrigins.map((origin) => `${origin}${callbackRoute}`),
    ...(input.environment === 'local' ? getLocalAuthRedirectPatterns(callbackRoute) : []),
    ...nativeRedirectUris,
  ]);

  return {
    providerCallbackUrl: `${gatewayOrigin}/auth/v1/callback`,
    siteUrl,
    redirectAllowList,
    serializedRedirectAllowList: redirectAllowList.join(','),
  };
}

export function getLocalAuthRedirectPatterns(callbackRoute: string): readonly string[] {
  const normalizedRoute = normalizeCallbackRoute(callbackRoute);
  return [
    `http://127.0.0.1:*${normalizedRoute}`,
    `http://localhost:*${normalizedRoute}`,
  ];
}

export function normalizeAuthCallbackRoute(callbackRoute: string): string {
  return normalizeCallbackRoute(callbackRoute);
}

function normalizeCallbackRoute(callbackRoute: string): string {
  const trimmed = callbackRoute.trim();
  if (!trimmed) {
    throw new Error('Auth callback route must not be empty.');
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const normalized = withLeadingSlash.replace(/\/{2,}/gu, '/');
  if (normalized.includes('?') || normalized.includes('#')) {
    throw new Error('Auth callback route must not include a query string or fragment.');
  }
  return normalized;
}

function normalizeWebOrigin(value: string, field: string): string {
  const parsed = parseUrl(value, field);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${field} must use http or https.`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${field} must be a canonical origin without credentials, query, or fragment.`);
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error(`${field} must not include a path.`);
  }
  return parsed.origin;
}

function normalizeNativeRedirectUri(value: string): string {
  const parsed = parseUrl(value, 'nativeRedirectUris');
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    throw new Error('nativeRedirectUris must use a non-HTTP application scheme.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      'nativeRedirectUris must not include credentials, query strings, or fragments.',
    );
  }
  return parsed.toString();
}

function parseUrl(value: string, field: string): URL {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} must not contain empty values.`);
  }

  try {
    return new URL(trimmed);
  } catch {
    throw new Error(`${field} contains an invalid URL.`);
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
