import { describe, expect, test } from 'bun:test';

import { generateInfrastructure } from './index';
import { createAppManifest } from './testSupport';
import type { InfraManifestInput } from './types';

const DEPLOYMENT = { target: 'minikube', monitoring: false } as const;

describe('canonical API infrastructure', () => {
  test('treats external APIs as infrastructure no-ops', () => {
    const manifest: InfraManifestInput = {
      deployment: DEPLOYMENT,
      modules: [],
      apis: [
        {
          id: 'nutrition',
          origin: 'external',
          protocol: 'rest',
          baseUrl: 'https://api.ankhorage.com/v1/nutrition',
          endpoints: {},
        },
      ],
    };

    const result = generateInfrastructure(manifest, {
      appManifest: createAppManifest('nutrition', manifest),
    });

    expect(result.warnings).not.toContainEqual(expect.stringContaining('infra.apis.nutrition'));
    expect(listApiArtifactPaths(result.files)).toEqual([]);
  });

  test('warns for internal APIs without generating partial API infrastructure', () => {
    const manifest: InfraManifestInput = {
      deployment: DEPLOYMENT,
      modules: [],
      apis: [
        {
          id: 'orders',
          origin: 'internal',
          protocol: 'rest',
          basePath: '/api/orders',
          endpoints: {},
        },
      ],
    };

    const result = generateInfrastructure(manifest, {
      appManifest: createAppManifest('orders', manifest),
    });

    expect(result.warnings).toContain(
      'infra.apis.orders has origin "internal", but internal API provisioning is not supported in Phase 1; no API infrastructure will be generated.',
    );
    expect(listApiArtifactPaths(result.files)).toEqual([]);
  });
});

function listApiArtifactPaths(files: readonly { readonly path: string }[]): readonly string[] {
  return files
    .map((file) => file.path)
    .filter(
      (path) =>
        path.includes('generated-api') ||
        path.includes('generated_api') ||
        path.includes('/api/deployment') ||
        path.includes('/api/service'),
    );
}
