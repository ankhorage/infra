import { areCapabilitiesEqual, isCapability } from '@ankhorage/contracts/capabilities';
import { describe, expect, test } from 'bun:test';

import packageJson from '../package.json';
import { CAPABILITIES } from './capabilities/index.js';

describe('package metadata', () => {
  test('publishes the canonical capability catalog and bin entry', () => {
    expect(packageJson.name).toBe('@ankhorage/infra');
    expect(packageJson.type).toBe('module');
    expect(packageJson.bin).toEqual({
      'ankhorage-infra': './dist/cli/bin.js',
    });
    expect(packageJson.ankh.category).toBe('infra');
    expect(packageJson.ankh.provider).toBe('./dist/cli/index.js');
    expect(packageJson.ankh.capabilities).toHaveLength(CAPABILITIES.length);
    expect(packageJson.ankh.capabilities.every(isCapability)).toBeTrue();
    expect(packageJson.ankh.capabilities).toEqual(CAPABILITIES);
    expect(packageJson.exports['./project']).toEqual({
      types: './dist/project/index.d.ts',
      import: './dist/project/index.js',
      default: './dist/project/index.js',
    });
    expect(packageJson.exports['./capabilities']).toEqual({
      types: './dist/capabilities/index.d.ts',
      import: './dist/capabilities/index.js',
      default: './dist/capabilities/index.js',
    });
  });

  test('rejects string-only and conflicting capability metadata publication', () => {
    for (const [index, capability] of CAPABILITIES.entries()) {
      const published = packageJson.ankh.capabilities.at(index);
      if (published === undefined) throw new Error('Published capability metadata is incomplete.');
      expect(typeof published).toBe('object');
      expect(areCapabilitiesEqual(published, capability)).toBeTrue();
    }
  });
});
