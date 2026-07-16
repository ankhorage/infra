import { describe, expect, test } from 'bun:test';

import { generateInfrastructure } from './index';
import { createAppManifest } from './testSupport';
import type { InfraManifestInput } from './types';

describe('minikube generated app image lifecycle', () => {
  test('exposes generated cleanup flags and Docker image labels', () => {
    const manifest: InfraManifestInput = {
      deployment: {
        target: 'minikube',
        monitoring: false,
      },
      plugins: [],
    };

    const result = generateInfrastructure(manifest, { appManifest: createAppManifest('shop') });

    const envExample = result.files.find((file) => file.path === 'infra/minikube/.env.example');
    expect(envExample?.content).toContain('APP_IMAGE=ankh/shop:dev');
    expect(envExample?.content).toContain('APP_IMAGE_CLEANUP_ON_DOWN=true');
    expect(envExample?.content).toContain('APP_IMAGE_CLEANUP_MINIKUBE=true');
    expect(envExample?.content).toContain('APP_IMAGE_CLEANUP_DOCKER=true');

    const appBuildScript = result.files.find(
      (file) => file.path === 'infra/minikube/scripts/build-app-image.sh',
    );
    expect(appBuildScript?.content).toContain('docker build');
    expect(appBuildScript?.content).toContain('--label "ankhorage.kind=generated-app"');
    expect(appBuildScript?.content).toContain('--label "ankhorage.app_slug=${PROFILE}"');
    expect(appBuildScript?.content).toContain('--label "ankhorage.image=${APP_IMAGE}"');
    expect(appBuildScript?.content).toContain('-t "${APP_IMAGE}"');
    expect(appBuildScript?.content).toContain('-f "${DOCKERFILE_PATH}"');
  });
});
