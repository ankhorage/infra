import { describe, expect, test } from 'bun:test';

import { getLocalAuthRedirectPatterns, resolveAuthRedirectConfiguration } from './authRedirects';

describe('resolveAuthRedirectConfiguration', () => {
  test('derives an exact provider callback and local browser callback policy', () => {
    const config = resolveAuthRedirectConfiguration({
      environment: 'local',
      gatewayOrigin: 'http://127.0.0.1:18081/',
      siteOrigin: 'http://127.0.0.1:18080/',
      callbackRoute: 'auth/callback',
      webOrigins: ['http://localhost:8081'],
      nativeRedirectUris: ['ankh-demo://auth/callback'],
    });

    expect(config.providerCallbackUrl).toBe('http://127.0.0.1:18081/auth/v1/callback');
    expect(config.siteUrl).toBe('http://127.0.0.1:18080');
    expect(config.redirectAllowList).toEqual([
      'http://127.0.0.1:18080',
      'http://localhost:8081',
      'http://127.0.0.1:18080/auth/callback',
      'http://localhost:8081/auth/callback',
      'http://127.0.0.1:*/auth/callback',
      'http://localhost:*/auth/callback',
      'ankh-demo://auth/callback',
    ]);
  });

  test('never leaks local wildcard policy into preview or production', () => {
    for (const environment of ['preview', 'production'] as const) {
      const config = resolveAuthRedirectConfiguration({
        environment,
        gatewayOrigin: 'https://api.example.test',
        siteOrigin: 'https://app.example.test',
        callbackRoute: '/auth/callback',
      });

      expect(config.redirectAllowList).toEqual([
        'https://app.example.test',
        'https://app.example.test/auth/callback',
      ]);
      expect(config.serializedRedirectAllowList).not.toContain('localhost');
      expect(config.serializedRedirectAllowList).not.toContain('127.0.0.1');
      expect(config.serializedRedirectAllowList).not.toContain('*');
    }
  });

  test('normalizes callback routes and rejects unsafe origins', () => {
    expect(getLocalAuthRedirectPatterns('//auth//callback')).toEqual([
      'http://127.0.0.1:*/auth/callback',
      'http://localhost:*/auth/callback',
    ]);

    expect(() =>
      resolveAuthRedirectConfiguration({
        environment: 'production',
        gatewayOrigin: 'https://user:secret@example.test',
        siteOrigin: 'https://app.example.test',
        callbackRoute: '/auth/callback',
      }),
    ).toThrow('gatewayOrigin must be a canonical origin');
  });
});
