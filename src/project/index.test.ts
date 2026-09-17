import { describe, expect, test } from 'bun:test';

import {
  createProjectInfraCredentialPort,
  createProjectInfraLifecycle,
  readStoredInfraStateAsync,
  resolveInfraProjectAsync,
  writeInfraGeneratedArtifactsAsync,
} from './index.js';

describe('@ankhorage/infra/project', () => {
  test('exports project resolution, credentials, safe state and artifact owner APIs', () => {
    expect(createProjectInfraCredentialPort).toBeFunction();
    expect(createProjectInfraLifecycle).toBeFunction();
    expect(resolveInfraProjectAsync).toBeFunction();
    expect(readStoredInfraStateAsync).toBeFunction();
    expect(writeInfraGeneratedArtifactsAsync).toBeFunction();
  });
});
