import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';
import { describe, expect, test } from 'bun:test';

import { CAPABILITIES } from '../capabilities/index.js';
import { createProviderCommandDescriptors } from './createProviderCommandDescriptors.js';
import provider, { createInfraRuntimeProvider } from './index.js';

describe('Infra Ankh provider', () => {
  test('publishes the canonical capability descriptors and handlers', () => {
    const expected = createInfraRuntimeProvider() satisfies AnkhRuntimeCommandProvider;
    expect(expected.capabilities).toEqual(CAPABILITIES);
    expect(expected.commands).toEqual(createProviderCommandDescriptors());
    expect(expected.handlers).toHaveLength(8);
    expect(provider.handlers).toHaveLength(8);
  });
});
