import type { AppManifest } from '@ankhorage/contracts';
import { describe, expect, test } from 'bun:test';

import { generateInfrastructure } from './index';
import type { InfraManifestInput } from './types';

describe('generateInfrastructure', () => {
  test('generates minikube artifacts with supabase auth and cerbos authz resources', () => {
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
    const paths = result.files.map((f) => f.path);

    expect(result.meta.target).toBe('minikube');
    expect(result.meta.providers).toEqual(['auto', 'cerbos', 'supabase']);
    expect(paths).toContain('infra/minikube/k8s/namespace.yaml');
    expect(paths).toContain('infra/minikube/k8s/app/deployment.yaml');
    expect(paths).toContain('infra/minikube/k8s/app/service.yaml');
    expect(paths).toContain('infra/minikube/k8s/auth/supabase/supabase-auth.configmap.yaml');
    expect(paths).toContain('infra/minikube/k8s/auth/supabase/app-runtime-auth.env.configmap.yaml');
    expect(paths).toContain('infra/minikube/k8s/authz/cerbos/cerbos.policy.configmap.yaml');
    expect(paths).toContain('infra/minikube/k8s/authz/cerbos/cerbos.deployment.yaml');
    expect(paths).toContain('infra/minikube/auth/supabase-runtime-wiring.md');
    expect(paths).toContain('infra/minikube/k8s/storage/supabase/supabase-storage.configmap.yaml');
    expect(paths).toContain(
      'infra/minikube/k8s/storage/supabase/app-runtime-storage.env.configmap.yaml',
    );
    expect(paths).toContain('infra/minikube/scripts/up.sh');
    expect(paths).toContain('infra/minikube/scripts/build-app-image.sh');
    expect(paths).toContain('infra/minikube/scripts/port-forward.sh');
    expect(paths).toContain('infra/minikube/scripts/supabase-local-env.sh');
    expect(paths).toContain('infra/minikube/app-image/Dockerfile');
    expect(result.warnings).toContain(
      'Storage buckets are configured but not created automatically yet. Ensure buckets exist in Supabase Storage: assets.',
    );

    const namespaceFile = result.files.find((f) => f.path === 'infra/minikube/k8s/namespace.yaml');
    expect(namespaceFile?.content).toContain('name: alpha-local');

    const appInfraConfigMap = result.files.find(
      (f) => f.path === 'infra/minikube/k8s/app.configmap.yaml',
    );
    expect(appInfraConfigMap?.content).toContain('STORAGE_PROVIDER: "supabase"');
    expect(appInfraConfigMap?.content).toContain('STORAGE_BUCKETS: "assets"');
    expect(appInfraConfigMap?.content).toContain('STORAGE_DEFAULT_BUCKET: "assets"');

    const upScript = result.files.find((f) => f.path === 'infra/minikube/scripts/up.sh');
    expect(upScript?.executable).toBe(true);
    expect(upScript?.content).toContain('NAMESPACE="${ANKH_NAMESPACE:-alpha-local}"');
    expect(upScript?.content).toContain('APP_BUILD_ENABLED="${APP_BUILD_ENABLED:-true}"');
    expect(upScript?.content).toContain('BUILD_SCRIPT="${SCRIPT_DIR}/build-app-image.sh"');
    expect(upScript?.content).toContain('APP_IMAGE="${APP_IMAGE:-ankh/alpha-local:dev}"');
    expect(upScript?.content).toContain(
      'APP_FORCE_ROLLOUT_RESTART="${APP_FORCE_ROLLOUT_RESTART:-true}"',
    );
    expect(upScript?.content).toContain('"${BUILD_SCRIPT}"');
    expect(upScript?.content).toContain(
      'minikube -p "${PROFILE}" image load --daemon=true --overwrite=true "${APP_IMAGE}"',
    );
    expect(upScript?.content).toContain(
      'APP_IMAGE_SYNC_STRATEGY="${APP_IMAGE_SYNC_STRATEGY:-docker-load}"',
    );
    expect(upScript?.content).toContain('AUTH_RUNTIME_MODE="${AUTH_RUNTIME_MODE:-local}"');
    expect(upScript?.content).toContain(
      'minikube -p "${PROFILE}" image build -t "${APP_IMAGE}" -f "${ROOT_DIR}/app-image/Dockerfile" "${EXPORT_DIR}"',
    );
    expect(upScript?.content).toContain('APP_IMAGE_PULL_SECRET_NAME');
    expect(upScript?.content).toContain('create secret docker-registry');
    expect(upScript?.content).toContain('PULL_SECRET_PATCH=');
    expect(upScript?.content).toContain('--patch "${PULL_SECRET_PATCH}"');
    expect(upScript?.content).toContain(
      'SUPABASE_SECRET_SYNC_ENABLED="${SUPABASE_SECRET_SYNC_ENABLED:-true}"',
    );
    expect(upScript?.content).toContain(
      'SUPABASE_LOCAL_ENV_SCRIPT="${SCRIPT_DIR}/supabase-local-env.sh"',
    );
    expect(upScript?.content).toContain(
      'Supabase keys missing; running ${SUPABASE_LOCAL_ENV_SCRIPT}.',
    );
    expect(upScript?.content).toContain('create secret generic supabase-auth-secrets');
    expect(upScript?.content).toContain(
      'Synchronized supabase-auth-secrets from environment values.',
    );
    expect(upScript?.content).toContain('imagePullSecrets');
    expect(upScript?.content).toContain('set image deployment/app-runtime');
    expect(upScript?.content).toContain('scale deployment/app-runtime');
    expect(upScript?.content).toContain('rollout restart deployment/app-runtime');
    expect(upScript?.content).toContain('rollout status deployment/app-runtime --timeout=180s');

    const kustomization = result.files.find(
      (f) => f.path === 'infra/minikube/k8s/kustomization.yaml',
    );
    expect(kustomization?.content).toContain('auth/supabase/supabase-auth.configmap.yaml');
    expect(kustomization?.content).toContain('auth/supabase/app-runtime-auth.env.configmap.yaml');
    expect(kustomization?.content).toContain('authz/cerbos/cerbos.policy.configmap.yaml');
    expect(kustomization?.content).toContain('authz/cerbos/cerbos.deployment.yaml');
    expect(kustomization?.content).toContain('storage/supabase/supabase-storage.configmap.yaml');
    expect(kustomization?.content).toContain(
      'storage/supabase/app-runtime-storage.env.configmap.yaml',
    );
    expect(kustomization?.content).toContain('app/deployment.yaml');
    expect(kustomization?.content).toContain('app/service.yaml');

    const envExample = result.files.find((f) => f.path === 'infra/minikube/.env.example');
    expect(envExample?.content).toContain('SUPABASE_JWT_SECRET=');
    expect(envExample?.content).toContain('SUPABASE_SECRET_SYNC_ENABLED=true');
    expect(envExample?.content).toContain('CERBOS_URL=http://cerbos:3592');
    expect(envExample?.content).toContain('EXPO_PUBLIC_SUPABASE_URL=');
    expect(envExample?.content).toContain('APP_BUILD_ENABLED=true');
    expect(envExample?.content).toContain('APP_SOURCE_DIR=');
    expect(envExample?.content).toContain('APP_WEB_EXPORT_DIR=.ankh/web-export');
    expect(envExample?.content).toContain('SUPABASE_PROJECT_DIR=');
    expect(envExample?.content).toContain('SUPABASE_LOCAL_PORT_BASE=55540');
    expect(envExample?.content).toContain('SUPABASE_LOCAL_ANALYTICS_PORT=55545');
    expect(envExample?.content).toContain('APP_IMAGE=ankh/alpha-local:dev');
    expect(envExample?.content).toContain('APP_IMAGE_SYNC_STRATEGY=docker-load');
    expect(envExample?.content).toContain('AUTH_RUNTIME_MODE=local');
    expect(envExample?.content).toContain('APP_PORT_FORWARD_LOCAL_PORT=18080');
    expect(envExample?.content).toContain('APP_PORT_FORWARD_REMOTE_PORT=80');
    expect(envExample?.content).toContain('APP_REPLICAS=');
    expect(envExample?.content).toContain('APP_FORCE_ROLLOUT_RESTART=true');
    expect(envExample?.content).toContain('APP_IMAGE_PULL_SECRET_NAME=');
    expect(envExample?.content).toContain('APP_IMAGE_PULL_SECRET_SERVER=');
    expect(envExample?.content).toContain('STORAGE_PROVIDER=supabase');
    expect(envExample?.content).toContain('STORAGE_RUNTIME_MODE=local');
    expect(envExample?.content).toContain('STORAGE_BUCKETS=assets');
    expect(envExample?.content).toContain('STORAGE_DEFAULT_BUCKET=assets');
    expect(envExample?.content).toContain('EXPO_PUBLIC_STORAGE_PROVIDER=supabase');
    expect(envExample?.content).toContain('EXPO_PUBLIC_STORAGE_BUCKETS=assets');
    expect(envExample?.content).toContain('EXPO_PUBLIC_STORAGE_DEFAULT_BUCKET=assets');

    const minikubeReadme = result.files.find((f) => f.path === 'infra/minikube/README.md');
    expect(minikubeReadme?.content).toContain('SUPABASE_LOCAL_ANALYTICS_PORT');
    expect(minikubeReadme?.content).toContain('55545');
    expect(minikubeReadme?.content).toContain('Supabase local project identity: `alpha`');
    expect(minikubeReadme?.content).toContain('$APP_SOURCE_DIR/.env.local');
    expect(minikubeReadme?.content).toContain('apps/card/.env.local');

    const runtimeGuide = result.files.find(
      (f) => f.path === 'infra/minikube/auth/supabase-runtime-wiring.md',
    );
    expect(runtimeGuide?.content).toContain('envFrom:');
    expect(runtimeGuide?.content).toContain('supabase-auth-secrets');
    expect(runtimeGuide?.content).toContain('AUTH_SIGN_IN_IDENTIFIERS');
    expect(runtimeGuide?.content).toContain('AUTH_SIGN_UP_REQUIRED_FIELDS');
    expect(runtimeGuide?.content).toContain('AUTH_SIGN_UP_OPTIONAL_FIELDS');
    expect(runtimeGuide?.content).toContain('AUTH_SIGN_UP_POLICY');
    expect(runtimeGuide?.content).toContain('AUTH_PROFILE_FIELDS');

    const supabaseConfigMap = result.files.find(
      (f) => f.path === 'infra/minikube/k8s/auth/supabase/supabase-auth.configmap.yaml',
    );
    expect(supabaseConfigMap?.content).toContain('AUTH_SIGN_IN_IDENTIFIERS: "email,username"');
    expect(supabaseConfigMap?.content).toContain('AUTH_SIGN_UP_REQUIRED_FIELDS: "email,password"');
    expect(supabaseConfigMap?.content).toContain(
      'AUTH_SIGN_UP_OPTIONAL_FIELDS: "firstName,lastName"',
    );
    expect(supabaseConfigMap?.content).toContain('AUTH_SIGN_UP_POLICY: "requireVerification"');
    expect(supabaseConfigMap?.content).toContain(
      'AUTH_PROFILE_FIELDS: "email,firstName,lastName,avatarUrl"',
    );

    const runtimeAuthConfigMap = result.files.find(
      (f) => f.path === 'infra/minikube/k8s/auth/supabase/app-runtime-auth.env.configmap.yaml',
    );
    expect(runtimeAuthConfigMap?.content).toContain('AUTH_SIGN_IN_IDENTIFIERS: "email,username"');
    expect(runtimeAuthConfigMap?.content).toContain(
      'AUTH_SIGN_UP_REQUIRED_FIELDS: "email,password"',
    );
    expect(runtimeAuthConfigMap?.content).toContain(
      'AUTH_SIGN_UP_OPTIONAL_FIELDS: "firstName,lastName"',
    );
    expect(runtimeAuthConfigMap?.content).toContain('AUTH_SIGN_UP_POLICY: "requireVerification"');
    expect(runtimeAuthConfigMap?.content).toContain(
      'AUTH_PROFILE_FIELDS: "email,firstName,lastName,avatarUrl"',
    );

    const appDeployment = result.files.find(
      (f) => f.path === 'infra/minikube/k8s/app/deployment.yaml',
    );
    expect(appDeployment?.content).toContain('image: ankh/alpha-local:dev');
    expect(appDeployment?.content).toContain('name: app-infra-config');
    expect(appDeployment?.content).toContain('name: app-runtime-auth-env');
    expect(appDeployment?.content).toContain('name: app-runtime-storage-env');
    expect(appDeployment?.content).toContain('name: supabase-auth-secrets');

    const appDeploymentContent = appDeployment?.content ?? '';
    const appInfraIndex = appDeploymentContent.indexOf('name: app-infra-config');
    const authIndex = appDeploymentContent.indexOf('name: app-runtime-auth-env');
    const storageIndex = appDeploymentContent.indexOf('name: app-runtime-storage-env');
    const supabaseSecretsIndex = appDeploymentContent.indexOf('name: supabase-auth-secrets');

    // envFrom precedence: later sources win on duplicate keys; explicit `env` entries win over `envFrom`.
    // Keep storage discovery (`app-runtime-storage-env`) before provider secrets to allow future overlap.
    expect(appInfraIndex).toBeGreaterThanOrEqual(0);
    expect(authIndex).toBeGreaterThan(appInfraIndex);
    expect(storageIndex).toBeGreaterThan(authIndex);
    expect(supabaseSecretsIndex).toBeGreaterThan(storageIndex);

    const appBuildScript = result.files.find(
      (f) => f.path === 'infra/minikube/scripts/build-app-image.sh',
    );
    expect(appBuildScript?.executable).toBe(true);
    expect(appBuildScript?.content).toContain('bunx expo export --platform web --output-dir');
    expect(appBuildScript?.content).toContain('docker build -t "${APP_IMAGE}"');
    expect(appBuildScript?.content).toContain('APP_SOURCE_DIR=');

    const portForwardScript = result.files.find(
      (f) => f.path === 'infra/minikube/scripts/port-forward.sh',
    );
    expect(portForwardScript?.executable).toBe(true);
    expect(portForwardScript?.content).toContain(
      'kubectl -n "${NAMESPACE}" port-forward service/app-runtime "${LOCAL_PORT}:${REMOTE_PORT}"',
    );
    expect(portForwardScript?.content).toContain(
      'LOCAL_PORT="${APP_PORT_FORWARD_LOCAL_PORT:-18080}"',
    );

    const supabaseLocalEnvScript = result.files.find(
      (f) => f.path === 'infra/minikube/scripts/supabase-local-env.sh',
    );
    expect(supabaseLocalEnvScript?.executable).toBe(true);
    expect(supabaseLocalEnvScript?.content).toContain('supabase status -o env');
    expect(supabaseLocalEnvScript?.content).toContain(
      'supabase --workdir "${SUPABASE_PROJECT_DIR}" init --yes',
    );
    expect(supabaseLocalEnvScript?.content).toContain(
      'supabase --workdir "${SUPABASE_PROJECT_DIR}" start',
    );
    expect(supabaseLocalEnvScript?.content).toContain(
      'supabase --workdir "${SUPABASE_PROJECT_DIR}" migration up --local',
    );
    expect(supabaseLocalEnvScript?.content).toContain('SUPABASE_PROJECT_DIR');
    expect(supabaseLocalEnvScript?.content).toContain(
      'SUPABASE_PROJECT_DIR="${SUPABASE_PROJECT_DIR:-${ROOT_DIR}}"',
    );
    expect(supabaseLocalEnvScript?.content).toContain('supabase CLI >= 2.106.0 is required');
    expect(supabaseLocalEnvScript?.content).toContain('SUPABASE_LOCAL_ANALYTICS_PORT');
    expect(supabaseLocalEnvScript?.content).toContain('export SUPABASE_LOCAL_ANALYTICS_PORT');
    expect(supabaseLocalEnvScript?.content).toContain(
      'Patch("analytics", "port", _env_required("SUPABASE_LOCAL_ANALYTICS_PORT"))',
    );
    expect(supabaseLocalEnvScript?.content).toContain(
      'upsert_env "${ENV_FILE}" "SUPABASE_LOCAL_ANALYTICS_PORT" "${SUPABASE_LOCAL_ANALYTICS_PORT}"',
    );

    const appImageDockerfile = result.files.find(
      (f) => f.path === 'infra/minikube/app-image/Dockerfile',
    );
    expect(appImageDockerfile?.content).toContain('FROM nginx:1.27-alpine');
    expect(appImageDockerfile?.content).toContain('listen 8080;');
    expect(appImageDockerfile?.content).toContain('COPY . /usr/share/nginx/html');

    const cerbosConfig = result.files.find(
      (f) => f.path === 'infra/minikube/k8s/authz/cerbos/cerbos.configmap.yaml',
    );
    const cerbosPolicy = result.files.find(
      (f) => f.path === 'infra/minikube/k8s/authz/cerbos/cerbos.policy.configmap.yaml',
    );
    const cerbosDeployment = result.files.find(
      (f) => f.path === 'infra/minikube/k8s/authz/cerbos/cerbos.deployment.yaml',
    );

    expect(cerbosConfig?.content).toContain('name: cerbos-config');
    expect(cerbosConfig?.content).toContain('config.yaml: |');
    expect(cerbosConfig?.content).not.toContain('resource_policy.yaml');
    expect(cerbosPolicy?.content).toContain('name: cerbos-policy');
    expect(cerbosPolicy?.content).toContain('app.resource_policy.yaml: |');
    expect(cerbosPolicy?.content).not.toContain('route.resource_policy.yaml: |');
    expect(cerbosPolicy?.content).not.toContain('screen.resource_policy.yaml: |');
    expect(cerbosPolicy?.content).not.toContain('metadata.yaml');
    expect(cerbosDeployment?.content).toContain('name: cerbos-policy');
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
        authorization: {
          kind: 'ABAC',
          engine: 'cerbos',
        },
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
      namespaceHint: 'shop',
      appManifest: createAppManifest('shop'),
    });

    expect(result.warnings).toContain(
      'Storage buckets are configured but not created automatically yet. Ensure buckets exist in Supabase Storage: assets,uploads.',
    );

    const storageConfig = result.files.find(
      (f) => f.path === 'infra/minikube/k8s/storage/supabase/supabase-storage.configmap.yaml',
    );
    expect(storageConfig?.content).toContain('STORAGE_PROVIDER: "supabase"');
    expect(storageConfig?.content).toContain('STORAGE_BUCKETS: "assets,uploads"');
    expect(storageConfig?.content).toContain('STORAGE_DEFAULT_BUCKET: "assets"');

    const runtimeStorageEnv = result.files.find(
      (f) =>
        f.path === 'infra/minikube/k8s/storage/supabase/app-runtime-storage.env.configmap.yaml',
    );
    expect(runtimeStorageEnv?.content).toContain('STORAGE_RUNTIME_MODE: "local"');
    expect(runtimeStorageEnv?.content).toContain('STORAGE_BUCKETS: "assets,uploads"');
    expect(runtimeStorageEnv?.content).toContain('EXPO_PUBLIC_STORAGE_BUCKETS: "assets,uploads"');
    expect(runtimeStorageEnv?.content).toContain('EXPO_PUBLIC_STORAGE_DEFAULT_BUCKET: "assets"');

    const appInfraConfigMap = result.files.find(
      (f) => f.path === 'infra/minikube/k8s/app.configmap.yaml',
    );
    expect(appInfraConfigMap?.content).toContain('STORAGE_PROVIDER: "supabase"');
    expect(appInfraConfigMap?.content).toContain('STORAGE_BUCKETS: "assets,uploads"');
    expect(appInfraConfigMap?.content).toContain('STORAGE_DEFAULT_BUCKET: "assets"');
  });

  test('resolves storage.provider="auto" to supabase when database provider is supabase', () => {
    const manifest: InfraManifestInput = {
      deployment: {
        target: 'minikube',
        monitoring: false,
      },
      database: {
        provider: 'supabase',
        tier: 'dev',
      },
      storage: {
        provider: 'auto',
        buckets: ['assets'],
      },
      plugins: [],
    };

    const result = generateInfrastructure(manifest, {
      namespaceHint: 'shop',
      appManifest: createAppManifest('shop'),
    });

    expect(result.files.map((f) => f.path)).toContain(
      'infra/minikube/k8s/storage/supabase/app-runtime-storage.env.configmap.yaml',
    );

    const envExample = result.files.find((f) => f.path === 'infra/minikube/.env.example');
    expect(envExample?.content).toContain('STORAGE_PROVIDER=supabase');
    expect(envExample?.content).toContain('EXPO_PUBLIC_STORAGE_PROVIDER=supabase');
    expect(envExample?.content).toContain('SUPABASE_URL=');
    expect(envExample?.content).toContain('EXPO_PUBLIC_SUPABASE_URL=');

    const appInfraConfigMap = result.files.find(
      (f) => f.path === 'infra/minikube/k8s/app.configmap.yaml',
    );
    expect(appInfraConfigMap?.content).toContain('STORAGE_PROVIDER: "supabase"');
    expect(appInfraConfigMap?.content).toContain('STORAGE_BUCKETS: "assets"');
    expect(appInfraConfigMap?.content).toContain('STORAGE_DEFAULT_BUCKET: "assets"');
  });

  test('warns when explicit supabase provider buckets are empty after normalization', () => {
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
      storage: {
        provider: 'supabase',
        buckets: ['', ' ', '   '],
      },
      plugins: [],
    };

    const result = generateInfrastructure(manifest, {
      namespaceHint: 'shop',
      appManifest: createAppManifest('shop'),
    });
    expect(result.warnings).toContain(
      'Storage buckets are empty after normalization; no storage artifacts generated.',
    );
    expect(result.files.map((f) => f.path)).not.toContain(
      'infra/minikube/k8s/storage/supabase/app-runtime-storage.env.configmap.yaml',
    );
  });

  test('warns when auto provider resolves to supabase but buckets are empty after normalization', () => {
    const manifest: InfraManifestInput = {
      deployment: {
        target: 'minikube',
        monitoring: false,
      },
      database: {
        provider: 'supabase',
        tier: 'dev',
      },
      storage: {
        provider: 'auto',
        buckets: [' ', ''],
      },
      plugins: [],
    };

    const result = generateInfrastructure(manifest, {
      namespaceHint: 'shop',
      appManifest: createAppManifest('shop'),
    });
    expect(result.warnings).toContain(
      'Storage buckets are empty after normalization; no storage artifacts generated.',
    );
    expect(result.files.map((f) => f.path)).not.toContain(
      'infra/minikube/k8s/storage/supabase/app-runtime-storage.env.configmap.yaml',
    );
  });

  test('does not resolve storage.provider="auto" when neither auth nor database is supabase', () => {
    const manifest: InfraManifestInput = {
      deployment: {
        target: 'minikube',
        monitoring: false,
      },
      storage: {
        provider: 'auto',
        buckets: ['assets'],
      },
      plugins: [],
    };

    const result = generateInfrastructure(manifest, {
      namespaceHint: 'shop',
      appManifest: createAppManifest('shop'),
    });
    expect(result.warnings).toContain(
      'Storage provider "auto" could not be resolved for minikube; no storage artifacts generated.',
    );
    expect(result.files.map((f) => f.path)).not.toContain(
      'infra/minikube/k8s/storage/supabase/app-runtime-storage.env.configmap.yaml',
    );
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

    const result = generateInfrastructure(manifest, { namespaceHint: 'shop', appManifest });
    const cerbosPolicy = result.files.find(
      (f) => f.path === 'infra/minikube/k8s/authz/cerbos/cerbos.policy.configmap.yaml',
    );

    expect(cerbosPolicy?.content).toContain('app.resource_policy.yaml: |');
    expect(cerbosPolicy?.content).toContain('route.resource_policy.yaml: |');
    expect(cerbosPolicy?.content).toContain('screen.resource_policy.yaml: |');
    expect(cerbosPolicy?.content).toContain(
      'expr: "request.resource.attr.route in [\\"sign-in\\",\\"sign-up\\"]"',
    );
    expect(cerbosPolicy?.content).toContain(
      'expr: "request.resource.attr.route in [\\"cart\\",\\"index\\"]"',
    );
    expect(cerbosPolicy?.content).toContain(
      'expr: "request.resource.attr.screen_id in [\\"screen-sign-in\\",\\"screen-sign-up\\"]"',
    );
    expect(cerbosPolicy?.content).toContain(
      'expr: "request.resource.attr.screen_id in [\\"screen-cart\\",\\"screen-home\\"]"',
    );
    expect(cerbosPolicy?.content).toContain('roles: ["anonymous","authenticated"]');
    expect(cerbosPolicy?.content).toContain('roles: ["authenticated"]');
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

  test('throws for cognito provider until adapter is implemented', () => {
    const manifest: InfraManifestInput = {
      deployment: {
        target: 'minikube',
        monitoring: false,
      },
      auth: {
        scope: 'global',
        provider: 'cognito',
        authorization: {
          kind: 'ABAC',
          engine: 'cerbos',
        },
      },
      plugins: [],
    };

    expect(() => generateInfrastructure(manifest)).toThrow(
      'Unsupported auth provider for minikube adapter: "cognito". Only "supabase" is currently supported.',
    );
  });

  test('throws for unsupported opa authorization engine', () => {
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
          engine: 'opa' as never,
        },
      },
      database: {
        provider: 'supabase',
        tier: 'dev',
      },
      plugins: [],
    };

    expect(() =>
      generateInfrastructure(manifest, { appManifest: createAppManifest('shop') }),
    ).toThrow('Unsupported authorization engine for minikube adapter: opa');
  });

  test('requires canonical app slug for local Supabase infrastructure', () => {
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
      'Cannot generate local Supabase infrastructure: appManifest.metadata.slug is required.',
    );
    expect(() =>
      generateInfrastructure(manifest, {
        namespaceHint: 'shop',
        appManifest: createAppManifest('Scanner App'),
      }),
    ).toThrow('appManifest.metadata.slug must be a canonical lowercase slug');
  });

  test('keeps Supabase project identity independent from domain-derived namespace', () => {
    const manifest: InfraManifestInput = {
      deployment: {
        target: 'minikube',
        monitoring: false,
      },
      database: {
        provider: 'supabase',
        tier: 'dev',
      },
      networking: {
        domain: 'local.example.test',
        cdn: false,
      },
      plugins: [],
    };

    const result = generateInfrastructure(manifest, {
      namespaceHint: 'ignored',
      appManifest: createAppManifest('scanner'),
    });
    const namespaceFile = result.files.find((f) => f.path === 'infra/minikube/k8s/namespace.yaml');
    const envExample = result.files.find((f) => f.path === 'infra/minikube/.env.example');
    const script = result.files.find(
      (f) => f.path === 'infra/minikube/scripts/supabase-local-env.sh',
    );

    expect(namespaceFile?.content).toContain('name: local-example-test');
    expect(envExample?.content).toContain('SUPABASE_LOCAL_PORT_BASE=64020');
    expect(envExample?.content).not.toContain('SUPABASE_LOCAL_PORT_BASE=61550');
    expect(script?.content).toContain('EXPECTED_SUPABASE_PROJECT_ID="scanner"');
  });

  test('uses namespace hint when domain is not provided', () => {
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

    const result = generateInfrastructure(manifest, {
      namespaceHint: 'shop',
      appManifest: createAppManifest('shop'),
    });
    const namespaceFile = result.files.find((f) => f.path === 'infra/minikube/k8s/namespace.yaml');
    const upScript = result.files.find((f) => f.path === 'infra/minikube/scripts/up.sh');
    const statusScript = result.files.find((f) => f.path === 'infra/minikube/scripts/status.sh');

    expect(namespaceFile?.content).toContain('name: shop');
    expect(upScript?.content).toContain('NAMESPACE="${ANKH_NAMESPACE:-shop}"');
    expect(upScript?.content).toContain('APP_IMAGE="${APP_IMAGE:-ankh/shop:dev}"');
    expect(statusScript?.content).toContain('NAMESPACE="${ANKH_NAMESPACE:-shop}"');
    expect(statusScript?.content).toContain('kubectl config current-context');
    expect(statusScript?.content).toContain('kubectl cluster-info');
    expect(statusScript?.content).toContain("Namespace '${NAMESPACE}' was not found");
    expect(statusScript?.content).toContain('Runtime auth checks:');
    expect(statusScript?.content).toContain('- AUTH_RUNTIME_MODE=${AUTH_RUNTIME_MODE}');
    expect(statusScript?.content).toContain('- secret/supabase-auth-secrets: present');
  });
});

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
