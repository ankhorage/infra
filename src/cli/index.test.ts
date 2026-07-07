import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';
import { describe, expect, test } from 'bun:test';

import { createProviderCommandDescriptors, INFRA_COMMANDS } from '../commands.js';
import provider, { createInfraRuntimeProvider } from './index.js';

describe('infra package cli provider', () => {
  test('publishes the expected runtime provider shape', () => {
    const expectedProvider = createInfraRuntimeProvider() satisfies AnkhRuntimeCommandProvider;

    expect(expectedProvider.id).toBe('@ankhorage/infra');
    expect(expectedProvider.category).toBe('infra');
    expect(expectedProvider.capabilities).toEqual([
      'infra.validate',
      'infra.generate',
      'infra.status',
      'infra.up',
      'infra.down',
    ]);
    expect(expectedProvider.commands).toEqual(createProviderCommandDescriptors());
    expect(expectedProvider.handlers?.map((handler) => handler.path.join(' '))).toEqual(
      INFRA_COMMANDS.map((command) => command.path.join(' ')),
    );
    expect(JSON.stringify(expectedProvider)).not.toContain('port-forward');
  });

  test('default export is the runtime provider', () => {
    expect(provider.category).toBe('infra');
    expect(provider.commands).toHaveLength(5);
    expect(provider.handlers).toHaveLength(5);
  });
});
