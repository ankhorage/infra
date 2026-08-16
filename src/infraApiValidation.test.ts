import { describe, expect, test } from 'bun:test';

import { validateInfraSupport } from './infraValidation';
import type { InfraManifestInput } from './types';

describe('canonical API support validation', () => {
  test('does not warn for external APIs', () => {
    const manifest: InfraManifestInput = {
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

    expect(validateInfraSupport(manifest)).toEqual([]);
  });

  test('reports every internal API as unsupported without treating it as invalid', () => {
    const manifest: InfraManifestInput = {
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

    expect(validateInfraSupport(manifest)).toEqual([
      'infra.apis.orders has origin "internal", but internal API provisioning is not supported in Phase 1; no API infrastructure will be generated.',
    ]);
  });
});
