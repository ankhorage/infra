import { isCapability } from '@ankhorage/contracts/capabilities';
import { describe, expect, test } from 'bun:test';

import { CAPABILITIES } from './index.js';

describe('Infra capabilities', () => {
  test('contains one canonical descriptor for every executable lifecycle operation', () => {
    expect(CAPABILITIES).toHaveLength(8);
    expect(CAPABILITIES.every(isCapability)).toBeTrue();
    expect(new Set(CAPABILITIES.map(({ id }) => id)).size).toBe(CAPABILITIES.length);
    for (const capability of CAPABILITIES) {
      expect(capability.owner).toBe('@ankhorage/infra');
      expect(capability.access).toEqual(['invoke']);
      expect(capability.binding).toEqual({ kind: 'action', bindableAs: ['target'] });
    }
  });
});
