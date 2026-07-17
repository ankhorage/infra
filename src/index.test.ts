import type { AppManifest } from '@ankhorage/contracts';
import { describe, expect, test } from 'bun:test';

import { generateInfrastructure } from './index';
import type { InfraManifestInput } from './types';

describe('generateInfrastructure', () => {
  test('generates minikube artifacts for app-owned Kubernetes infrastructure', () => {
    const manifest: InfraManifestInput = {
      deployment: {
        target: 'minikube',
        monitoring: false,
      },
      auth: {
        scope: 'global',
        provider: 'supabase',
        authorization: {
          kind: 'ABAC',
          engine: 'cerbos',
        },
        signIn: {
          identifiers: ['email', 'username'],
        },
        signUp: {
          requiredFields: ['email', 'password'],
          optionalFields: ['firstName', 'lastName'],
          signUpPolicy: 'requireVerification',
        },
        profile: {
          fields: ['email', 'firstName', 'lastName', 'avatarUrl'],
        },
      },
      database: {
        provider: 'supabase',
        tier: 'dev',
      },
      storage: {
        provider: 'auto',
        buckets: ['assets'],
      },
      networking: {
        domain: 'alpha.local',
        cdn: false,
      },
      plugins: [],
    };

    const result = generateInfrastructure(manifest, { appManifest: createAppManifest('alpha') });
    const paths = result.files.map((file) => file.path);

    expect(result.meta.target).toBe('minikube');
    expect(result.meta.providers).toEqual(['auto', 'cerbos', 'supabase']);
    expect(paths).toContain('infra/minikube/k8s/namespaces/app.yaml');
    expect(paths).toContain('infra/minikube/k8s/namespaces/supabase.yaml');
    expect(paths).toContain('infra/minikube/k8s/app/deployment.yaml');
    expect(paths).toContain('infra/minikube/k8s/app/service.yaml');
    expect(paths).toContain('infra/minikube/k8s/supabase/postgres.yaml');
    expect(paths).toContain('infra/minikube/k8s/supabase/gateway.yaml');
    expect(paths).toContain('infra/minikube/k8s/auth/supabase/supabase-auth.configmap.yaml');
    expect(paths).toContain('infra/minikube/k8s/auth/supabase/app-runtime-auth.env.configmap.yaml');
    expect(paths).toContain('infra/minikube/k8s/authz/cerbos/cerbos.policy.configmap.yaml');
    expect(paths).toContain('infra/minikube/k8s/authz/cerbos/cerbos.deployment.yaml');
    expect(paths).toContain('infra/minikube/k8s/storage/supabase/supabase-storage.configmap.yaml');
    expect(paths).toContain(
      'infra/minikube/k8s/storage/supabase/app-runtime-storage.env.configmap.yaml',
    );
    expect(paths).toContain('infra/minikube/scripts/up.sh');
    expect(paths).toContain('infra/minikube/scripts/down.sh');
    expect(paths).toContain('infra/minikube/scripts/reset.sh');
    expect(paths).toContain('infra/minikube/scripts/destroy.sh');
    expect(paths).toContain('infra/minikube/scripts/status.sh');
    expect(paths).toContain('infra/minikube/scripts/port-forward.sh');
    expect(paths).not.toContain('infra/minikube/scripts/supabase-local-env.sh');

    const envExample = getFile(result.files, 'infra/minikube/.env.example');
    expect(envExample).toContain('ANKH_APP_SLUG=alpha');
    expect(envExample).not.toContain('SUPABASE_RUNTIME_ENABLED=');
    expect(envExample).toContain('EXPO_PUBLIC_SUPABASE_URL=');
    expect(envExample).toContain('APP_IMAGE=ankh/alpha:dev');
    expect(envExample).not.toContain('MINIKUBE_PROFILE=');
    expect(envExample).not.toContain('SUPABASE_PROJECT_DIR=');

    const upScript = getFile(result.files, 'infra/minikube/scripts/up.sh');
    expect(upScript).toContain('SUPABASE_RUNTIME_ENABLED="true"');
    expect(upScript).not.toContain('SUPABASE_RUNTIME_ENABLED="${SUPABASE_RUNTIME_ENABLED');
    expect(upScript).toContain('minikube start -p "${PROFILE}"');
    expect(upScript).toContain('kubectl --context "${PROFILE}" apply -k "${K8S_DIR}"');
    expect(upScript).toContain('supabase migration up --db-url "${SUPABASE_DB_URL}"');
    expect(upScript).toContain('create secret generic supabase-runtime-secrets');
    expect(upScript).toContain('create secret generic supabase-public-runtime');
    expect(upScript).toContain('rollout status deployment/app-runtime --timeout=180s');
    expect(upScript).not.toContain('supabase start');
    expect(upScript).not.toContain('supabase status');

    const appDeployment = getFile(result.files, 'infra/minikube/k8s/app/deployment.yaml');
    expect(appDeployment).toContain('namespace: app');
    expect(appDeployment).toContain('image: ankh/alpha:dev');
    expect(appDeployment).toContain('name: supabase-public-runtime');
    expect(appDeployment).not.toContain('supabase-auth-secrets');

    const runtimeGuide = getFile(result.files, 'infra/minikube/auth/supabase-runtime-wiring.md');
    expect(runtimeGuide).toContain('supabase-public-runtime');
    expect(runtimeGuide).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  test('generates minikube storage artifacts for explicit supabase provider with normalized buckets', () => {
    const manifest: InfraManifestInput = {
      deployment: {
        target: 'minikube',
        monitoring: false,
      },
      auth: {
        scope: 'global',
        provider: 'supabase',
      },
      database: {
        provider: 'supabase',
        tier: 'dev',
      },
      storage: {
        provider: 'supabase',
        buckets: ['assets', ' assets ', '', 'assets', 'uploads'],
      },
      plugins: [],
    };

    const result = generateInfrastructure(manifest, {
      appManifest: createAppManifest('shop'),
    });

    expect(result.warnings).toContain(
      'Storage buckets are configured but not created automatically yet. Ensure buckets exist in Supabase Storage: assets,uploads.',
    );

    const storageConfig = getFile(
      result.files,
      'infra/minikube/k8s/storage/supabase/supabase-storage.configmap.yaml',
    );
    expect(storageConfig).toContain('namespace: app');
    expect(storageConfig).toContain('STORAGE_BUCKETS: "assets,uploads"');
    expect(storageConfig).toContain('STORAGE_DEFAULT_BUCKET: "assets"');
  });

  test('generates route and screen cerbos policies when app manifest context is provided', () => {
    const manifest: InfraManifestInput = {
      deployment: {
        target: 'minikube',
        monitoring: false,
      },
      auth: {
        scope: 'global',
        provider: 'supabase',
        authorization: {
          kind: 'ABAC',
          engine: 'cerbos',
        },
      },
      database: {
        provider: 'supabase',
        tier: 'dev',
      },
      plugins: [],
    };

    const appManifest: Pick<AppManifest, 'metadata' | 'navigator' | 'screens' | 'settings'> = {
      metadata: {
        name: 'Shop',
        slug: 'shop',
        version: '1.0.0',
        themeId: 'default',
      },
      navigator: {
        type: 'stack',
        routes: [
          { name: 'sign-in', screenId: 'screen-sign-in' },
          { name: 'sign-up', screenId: 'screen-sign-up', guards: ['public'] },
          { name: 'index', screenId: 'screen-home' },
          { name: 'cart', screenId: 'screen-cart', guards: ['auth'] },
        ],
      },
      screens: {
        'screen-sign-in': {
          id: 'screen-sign-in',
          name: 'SignIn',
          root: { id: 'sign-in-root', type: 'View', children: [] },
        },
        'screen-sign-up': {
          id: 'screen-sign-up',
          name: 'SignUp',
          root: { id: 'sign-up-root', type: 'View', children: [] },
        },
        'screen-home': {
          id: 'screen-home',
          name: 'Home',
          root: { id: 'home-root', type: 'View', children: [] },
        },
        'screen-cart': {
          id: 'screen-cart',
          name: 'Cart',
          root: { id: 'cart-root', type: 'View', children: [] },
        },
      },
      settings: {
        localization: {
          defaultLocale: 'en',
          locales: ['en'],
        },
        authFlow: {
          signInRoute: '/sign-in',
          signUpRoute: '/sign-up',
          signOutRoute: '/sign-out',
          unauthorizedRoute: '/sign-in',
          postSignInRoute: '/',
        },
      },
    };

    const result = generateInfrastructure(manifest, { appManifest });
    const cerbosPolicy = getFile(
      result.files,
      'infra/minikube/k8s/authz/cerbos/cerbos.policy.configmap.yaml',
    );

    expect(cerbosPolicy).toContain('route.resource_policy.yaml: |');
    expect(cerbosPolicy).toContain('screen.resource_policy.yaml: |');
    expect(cerbosPolicy).toContain(
      'expr: "request.resource.attr.route in [\\"sign-in\\",\\"sign-up\\"]"',
    );
    expect(cerbosPolicy).toContain(
      'expr: "request.resource.attr.route in [\\"cart\\",\\"index\\"]"',
    );
  });

  test('throws for missing deployment', () => {
    const manifest: InfraManifestInput = {
      plugins: [],
    };

    expect(() => generateInfrastructure(manifest)).toThrow('Deployment configuration is missing.');
  });

  test('throws for unsupported deployment target', () => {
    const manifest: InfraManifestInput = {
      deployment: {
        target: 'kubernetes',
        monitoring: false,
      },
      plugins: [],
    };

    expect(() => generateInfrastructure(manifest)).toThrow(
      'Unsupported deployment target: kubernetes',
    );
  });

  test('requires canonical app slug for minikube infrastructure', () => {
    const manifest: InfraManifestInput = {
      deployment: {
        target: 'minikube',
        monitoring: false,
      },
      database: {
        provider: 'supabase',
        tier: 'dev',
      },
      plugins: [],
    };

    expect(() => generateInfrastructure(manifest, { namespaceHint: 'shop' })).toThrow(
      'Cannot generate Minikube infrastructure: appManifest.metadata.slug is required.',
    );
    expect(() =>
      generateInfrastructure(manifest, {
        appManifest: createAppManifest('Scanner App'),
      }),
    ).toThrow('appManifest.metadata.slug must be a canonical lowercase slug up to 40 characters');
  });
});

function getFile(files: readonly { path: string; content: string }[], path: string): string {
  const file = files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`Missing generated file: ${path}`);
  return file.content;
}

function createAppManifest(
  slug: string,
): Pick<AppManifest, 'metadata' | 'navigator' | 'screens' | 'settings'> {
  return {
    metadata: {
      name: slug,
      slug,
      version: '1.0.0',
      themeId: 'default',
    },
    navigator: {
      type: 'stack',
      routes: [],
    },
    screens: {},
    settings: {
      localization: {
        defaultLocale: 'en',
        locales: ['en'],
      },
      authFlow: {
        signInRoute: '/sign-in',
        signUpRoute: '/sign-up',
        signOutRoute: '/sign-out',
        unauthorizedRoute: '/sign-in',
        postSignInRoute: '/',
      },
    },
  };
}
