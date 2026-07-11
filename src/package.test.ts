import type { AnkhPackageMetadata } from '@ankhorage/contracts/cli';
import { describe, expect, test } from 'bun:test';

import packageJson from '../package.json';

describe('package metadata', () => {
  test('publishes the expected Ankh metadata and bin entry', () => {
    const expectedAnkhMetadata = {
      category: 'infra',
      provider: './dist/cli/index.js',
      capabilities: [
        'infra.validate',
        'infra.generate',
        'infra.status',
        'infra.up',
        'infra.down',
        'infra.secret-store',
      ],
    } as const satisfies AnkhPackageMetadata;

    expect(packageJson.name).toBe('@ankhorage/infra');
    expect(packageJson.type).toBe('module');
    expect(packageJson.bin).toEqual({
      'ankhorage-infra': './dist/cli/bin.js',
    });
    expect(packageJson.ankh).toEqual(expectedAnkhMetadata);
    expect(JSON.parse(JSON.stringify(expectedAnkhMetadata))).toEqual(expectedAnkhMetadata);

    const capabilityText = JSON.stringify(packageJson.ankh.capabilities);
    expect(capabilityText).not.toContain('portForward');
    expect(capabilityText).not.toContain('port-forward');
    expect(capabilityText).not.toContain('port.forward');
  });
});
