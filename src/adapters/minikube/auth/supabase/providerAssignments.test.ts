import type { InfraManifest } from '@ankhorage/contracts';
import { expect, test } from 'bun:test';

import { generateInfrastructure } from '../../../../index';
import { createAppManifest } from '../../../../testSupport';

test('keeps multiple provider redirect assignments as separate shell arguments', () => {
  const manifest: InfraManifest = {
    deployment: { target: 'minikube', monitoring: false },
    auth: {
      scope: 'global',
      provider: 'supabase',
      oauth: {
        enabled: true,
        callbackRoute: '/auth/callback',
        providers: [
          { id: 'google', enabled: true, credentialsRef: 'auth/oauth/google' },
          { id: 'apple', enabled: true, credentialsRef: 'auth/oauth/apple' },
        ],
      },
    },
    database: { provider: 'supabase', tier: 'dev' },
    secretStore: { provider: 'supabase-vault' },
    plugins: [],
  };
  const result = generateInfrastructure(manifest, {
    appManifest: createAppManifest('multi-oauth'),
  });
  const upScript = result.files.find(
    (file) => file.path === 'infra/minikube/scripts/up.sh',
  )?.content;

  expect(upScript).toContain(
    'GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI="${oauth_provider_callback}"',
  );
  expect(upScript).toContain(
    'GOTRUE_EXTERNAL_APPLE_REDIRECT_URI="${oauth_provider_callback}"',
  );
  expect(upScript).not.toContain('\\  GOTRUE_EXTERNAL_APPLE_REDIRECT_URI');
});
