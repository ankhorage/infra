import type { AppDeployTargets } from '@ankhorage/contracts/deploy';
import { describe, expect, test } from 'bun:test';

import { resolveAuthTargetRedirectModel } from './authTargetRedirects';

describe('resolveAuthTargetRedirectModel', () => {
  test('derives enabled native callbacks and deduplicates shared schemes', () => {
    const targets: AppDeployTargets = {
      web: { enabled: true },
      android: {
        enabled: true,
        package: 'com.ankh.demo',
        scheme: 'ankh-demo',
      },
      ios: {
        enabled: true,
        bundleIdentifier: 'com.ankh.demo',
        scheme: 'ankh-demo',
      },
    };

    expect(resolveAuthTargetRedirectModel({ callbackRoute: '/auth/callback', targets })).toEqual({
      nativeRedirectUris: ['ankh-demo://auth/callback'],
      warnings: [],
      webEnabled: true,
    });
  });

  test('omits disabled targets and warns instead of guessing missing native schemes', () => {
    const targets: AppDeployTargets = {
      web: { enabled: false },
      android: {
        enabled: false,
        package: 'com.ankh.demo',
      },
      ios: {
        enabled: true,
        bundleIdentifier: 'com.ankh.demo',
      },
    };

    const result = resolveAuthTargetRedirectModel({ callbackRoute: '/auth/callback', targets });

    expect(result.nativeRedirectUris).toEqual([]);
    expect(result.webEnabled).toBe(false);
    expect(result.warnings).toEqual([
      'OAuth ios target is enabled but deploy.targets.ios.scheme is missing; native callback omitted.',
    ]);
  });

  test('keeps the pre-target manifest path Web-only and explicit', () => {
    expect(
      resolveAuthTargetRedirectModel({ callbackRoute: '/auth/callback', targets: undefined }),
    ).toEqual({
      nativeRedirectUris: [],
      warnings: [
        'OAuth deploy.targets is missing; Infra keeps Web-local redirects only until canonical targets are persisted.',
      ],
      webEnabled: true,
    });
  });
});
