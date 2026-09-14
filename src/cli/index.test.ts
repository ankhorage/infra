import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';
import { describe, expect, test } from 'bun:test';

import { createProviderCommandDescriptors } from './createProviderCommandDescriptors.js';
import provider, { createInfraRuntimeProvider } from './index.js';

describe('Infra Ankh provider', () => {
  test('publishes all eight canonical capabilities and handlers', () => {
    const expected = createInfraRuntimeProvider() satisfies AnkhRuntimeCommandProvider;
    expect(expected.capabilities).toEqual([
      'infra.validate',
      'infra.plan',
      'infra.generate',
      'infra.up',
      'infra.status',
      'infra.outputs',
      'infra.down',
      'infra.destroy',
    ]);
    expect(expected.commands).toEqual(createProviderCommandDescriptors());
    expect(expected.handlers).toHaveLength(8);
    expect(provider.handlers).toHaveLength(8);
  });
});
