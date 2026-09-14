import { describe, expect, test } from 'bun:test';

import * as infra from './index.js';

describe('@ankhorage/infra', () => {
  test('exports only the provider-neutral lifecycle and composition APIs', () => {
    expect(infra).toContainAllKeys([
      'createEnvironmentInfraCredentialPort',
      'createEnvironmentInfraSecretPort',
      'createNodeInfraAdapterPackageResolver',
      'destroyInfraEnvironmentAsync',
      'downInfraEnvironmentAsync',
      'generateInfraEnvironmentAsync',
      'getInfraEnvironmentOutputs',
      'orderInfraPlanActions',
      'planInfraEnvironmentAsync',
      'resolveInfraAdaptersAsync',
      'resolveInfraEnvironment',
      'statusInfraEnvironmentAsync',
      'upInfraEnvironmentAsync',
      'validateInfraEnvironmentAsync',
    ]);
    expect(Object.keys(infra)).not.toContain('createMinikubeAdapter');
    expect(Object.keys(infra)).not.toContain('resolveAuthRedirectConfiguration');
  });
});
