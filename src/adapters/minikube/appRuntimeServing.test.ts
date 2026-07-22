import { describe, expect, test } from 'bun:test';

import { generateInfrastructure } from '../../index';
import { createAppManifest } from '../../testSupport';

describe('generated Minikube app runtime serving', () => {
  test('keeps nginx redirects relative so port-forwarded browser origins are preserved', () => {
    const result = generateInfrastructure(
      {
        deployment: {
          target: 'minikube',
          monitoring: false,
        },
      },
      {
        appManifest: createAppManifest('forwarded-origin'),
      },
    );
    const dockerfile = result.files.find(
      (file) => file.path === 'infra/minikube/app-image/Dockerfile',
    );

    expect(dockerfile).toBeDefined();
    expect(dockerfile?.content).toContain('listen 8080;\n  absolute_redirect off;');
    expect(dockerfile?.content).toContain('try_files $uri $uri/ /index.html;');
    expect(dockerfile?.content).not.toContain('port_in_redirect off;');
  });
});
