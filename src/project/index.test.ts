import { describe, expect, test } from 'bun:test';

import {
  readStoredInfraStateAsync,
  resolveInfraProjectAsync,
  writeInfraGeneratedArtifactsAsync,
} from './index.js';

describe('@ankhorage/infra/project', () => {
  test('exports project resolution, safe state and artifact owner APIs', () => {
    expect(resolveInfraProjectAsync).toBeFunction();
    expect(readStoredInfraStateAsync).toBeFunction();
    expect(writeInfraGeneratedArtifactsAsync).toBeFunction();
  });
});
