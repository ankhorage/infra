import type { GeneratedInfrastructureFile } from '../../../types';
import type { InfraManifestInput } from '../../../types';
import {
  MANAGED_PROFILE_COLUMNS,
  type ResolvedProfileModel,
  resolveSupabaseProfileModel,
} from '../auth/supabase/profile';

interface SupabaseLocalPorts {
  base: number;
  shadow: number;
  api: number;
  db: number;
  studio: number;
  inbucket: number;
  analytics: number;
}

interface AppInfraStorageMetadata {
  provider: 'supabase';
  bucketsCsv: string;
  defaultBucket: string;
}

const SUPABASE_LOCAL_PORT_BASE = 55320;
const SUPABASE_LOCAL_PORT_BUCKET_SIZE = 10;
const SUPABASE_LOCAL_PORT_BUCKET_COUNT = 1000;
const SUPABASE_LOCAL_PORT_REFERENCE_PROJECT = 'my-app';

export function generateMinikubeBaseArtifacts(args: {
  manifest: InfraManifestInput;
  namespace: string;
  supabaseProjectId: string | null;
  extraResources: string[];
  extraEnvEntries: string[];
}): GeneratedInfrastructureFile[] {
  const { manifest, namespace, supabaseProjectId, extraResources, extraEnvEntries } = args;

  const root = 'infra/minikube';
  const k8sRoot = `${root}/k8s`;
  const scriptsRoot = `${root}/scripts`;
  const appImageRoot = `${root}/app-image`;
  const defaultAppImage = getDefaultAppImage(namespace);
  const supabaseLocalPorts = resolveSupabaseLocalPorts(supabaseProjectId ?? namespace);

  const authScope = manifest.auth?.scope ?? 'none';
  const authProvider = manifest.auth?.provider ?? 'none';
  const authzEngine = manifest.auth?.authorization?.engine ?? 'none';
  const databaseProvider = manifest.database?.provider ?? 'none';
  const secretStoreProvider = manifest.secretStore?.provider ?? 'none';
  const storageMetadata = resolveAppInfraStorageMetadata(manifest);
  const profileModel = resolveSupabaseProfileModel(manifest);
  const monitoringEnabled = manifest.deployment?.monitoring === true;
  const domain = manifest.networking?.domain ?? '';
  const supabaseLocalEnabled =
    authProvider === 'supabase' ||
    databaseProvider === 'supabase' ||
    storageMetadata !== null ||
    secretStoreProvider === 'supabase-vault';

  return [
    {
      path: `${root}/README.md`,
      content: getReadmeMarkdown({
        namespace,
        defaultAppImage,
        monitoringEnabled,
        authProvider,
        authzEngine,
        extraResources,
        supabaseLocalPorts,
        supabaseProjectId,
        supabaseLocalEnabled,
        profileModel,
      }),
    },
    {
      path: `${root}/.env.example`,
      content: getEnvExample({
        namespace,
        domain,
        extraEnvEntries,
        defaultAppImage,
        supabaseLocalPorts,
        supabaseLocalEnabled,
      }),
    },
    {
      path: `${k8sRoot}/namespace.yaml`,
      content: getNamespaceManifest(namespace),
    },
    {
      path: `${k8sRoot}/app.configmap.yaml`,
      content: getAppConfigMap({
        namespace,
        authScope,
        authProvider,
        databaseProvider,
        secretStoreProvider,
        storageMetadata,
        monitoringEnabled,
        domain,
      }),
    },
    {
      path: `${k8sRoot}/app/deployment.yaml`,
      content: getAppDeploymentManifest({ namespace, defaultAppImage }),
    },
    {
      path: `${k8sRoot}/app/service.yaml`,
      content: getAppServiceManifest(namespace),
    },
    {
      path: `${k8sRoot}/kustomization.yaml`,
      content: getKustomizationManifest(extraResources),
    },
    {
      path: `${scriptsRoot}/up.sh`,
      content: getUpScript({
        defaultNamespace: namespace,
        defaultAppImage,
        supabaseLocalEnabled,
      }),
      executable: true,
    },
    {
      path: `${scriptsRoot}/build-app-image.sh`,
      content: getBuildAppImageScript({ defaultNamespace: namespace, defaultAppImage }),
      executable: true,
    },
    {
      path: `${scriptsRoot}/port-forward.sh`,
      content: getPortForwardScript(namespace),
      executable: true,
    },
    {
      path: `${scriptsRoot}/down.sh`,
      content: getDownScript(),
      executable: true,
    },
    {
      path: `${scriptsRoot}/status.sh`,
      content: getStatusScript({
        defaultNamespace: namespace,
        supabaseProjectId,
        supabaseLocalEnabled,
        profileModel,
      }),
      executable: true,
    },
    {
      path: `${scriptsRoot}/supabase-local-env.sh`,
      content: getSupabaseLocalEnvScript({
        supabaseProjectId,
        supabaseLocalPorts,
        profileModel,
      }),
      executable: true,
    },
    {
      path: `${appImageRoot}/Dockerfile`,
      content: getAppImageDockerfile(),
    },
  ];
}

function getReadmeMarkdown(args: {
  namespace: string;
  defaultAppImage: string;
  monitoringEnabled: boolean;
  authProvider: string;
  authzEngine: string;
  extraResources: string[];
  supabaseLocalPorts: SupabaseLocalPorts;
  supabaseProjectId: string | null;
  supabaseLocalEnabled: boolean;
  profileModel: ResolvedProfileModel;
}): string {
  const {
    namespace,
    defaultAppImage,
    monitoringEnabled,
    authProvider,
    authzEngine,
    extraResources,
    supabaseLocalPorts,
    supabaseProjectId,
    supabaseLocalEnabled,
    profileModel,
  } = args;
  const resourceLines = [
    'namespace.yaml',
    'app.configmap.yaml',
    'app/deployment.yaml',
    'app/service.yaml',
    ...extraResources,
  ]
    .map((r) => `- \`k8s/${r}\``)
    .join('\n');

  return `# Minikube Infra

This directory is generated from \`ankh.config.json\` (infra manifest).

## Requirements

- minikube
- kubectl
- docker (when using the default driver)
- bun (for Expo web export in app image build flow)
- python3 (for patching generated local Supabase port defaults and checking port availability)

## Quick Start

1. Copy env template:
   \`\`\`bash
   cp .env.example .env
   \`\`\`
2. Optional: import local Supabase credentials from \`supabase status\` output:
   \`\`\`bash
   ./scripts/supabase-local-env.sh
   \`\`\`
3. Apply baseline infra:
   \`\`\`bash
   ./scripts/up.sh
   \`\`\`
4. Start app port-forward:
   \`\`\`bash
   ./scripts/port-forward.sh
   \`\`\`
5. Check status:
   \`\`\`bash
   ./scripts/status.sh
   \`\`\`
6. Tear down:
   \`\`\`bash
   ./scripts/down.sh
   \`\`\`

## Generated Resources

${resourceLines}

## Generated Helpers

- \`scripts/build-app-image.sh\`
- \`scripts/port-forward.sh\`
- \`scripts/supabase-local-env.sh\`
- \`app-image/Dockerfile\`

## Runtime Conventions

- Namespace: \`${namespace}\`
- Supabase local project identity: \`${supabaseProjectId ?? 'unused'}\`
- Monitoring requested: \`${monitoringEnabled ? 'true' : 'false'}\`
- Auth provider: \`${authProvider}\`
- Authorization engine: \`${authzEngine}\`
- Namespace source: \`infra.networking.domain\` first, otherwise project slug hint from CLI.

## App Runtime

Default app runtime manifests are generated:

- \`k8s/app/deployment.yaml\`
- \`k8s/app/service.yaml\`

Deployment env wiring includes:

- \`ConfigMap/app-infra-config\`
- \`ConfigMap/app-runtime-auth-env\` (optional)
- \`ConfigMap/app-runtime-storage-env\` (optional)
- \`Secret/supabase-auth-secrets\` (optional)

If \`auth.provider\` is \`supabase\`, use:

- \`k8s/auth/supabase/supabase-auth.secret.yaml\`
- \`k8s/auth/supabase/app-runtime-auth.env.configmap.yaml\`
- \`auth/supabase-runtime-wiring.md\`

The app deployment should import runtime config sources in this order:

\`\`\`yaml
envFrom:
  - configMapRef:
      name: app-runtime-auth-env
  - configMapRef:
      name: app-runtime-storage-env
  - secretRef:
      name: supabase-auth-secrets
\`\`\`

Default runtime knobs in \`.env\`:

- \`APP_BUILD_ENABLED\`
- \`APP_SOURCE_DIR\`
- \`APP_WEB_EXPORT_DIR\`
- \`APP_IMAGE\`
- \`APP_IMAGE_SYNC_STRATEGY\`
- \`APP_IMAGE_CLEANUP_ON_DOWN\`
- \`APP_IMAGE_CLEANUP_MINIKUBE\`
- \`APP_IMAGE_CLEANUP_DOCKER\`
- \`AUTH_RUNTIME_MODE\`
- \`APP_PORT_FORWARD_LOCAL_PORT\`
- \`APP_PORT_FORWARD_REMOTE_PORT\`
- \`APP_REPLICAS\`
- \`APP_FORCE_ROLLOUT_RESTART\`
- \`SUPABASE_PROJECT_DIR\` (optional supabase CLI project path)
- \`SUPABASE_LOCAL_PORT_BASE\` (generated default \`${supabaseLocalPorts.base}\`)
- \`SUPABASE_LOCAL_API_PORT\` (generated default \`${supabaseLocalPorts.api}\`)
- \`SUPABASE_LOCAL_DB_PORT\` (generated default \`${supabaseLocalPorts.db}\`)
- \`SUPABASE_LOCAL_STUDIO_PORT\` (generated default \`${supabaseLocalPorts.studio}\`)
- \`SUPABASE_LOCAL_INBUCKET_PORT\` (generated default \`${supabaseLocalPorts.inbucket}\`)
- \`SUPABASE_LOCAL_ANALYTICS_PORT\` (generated default \`${supabaseLocalPorts.analytics}\`)
- \`SUPABASE_LOCAL_SHADOW_PORT\` (generated default \`${supabaseLocalPorts.shadow}\`)
- \`APP_IMAGE_PULL_SECRET_NAME\` + credentials (optional, private registry)
- \`SUPABASE_SECRET_SYNC_ENABLED\`

Generated app Supabase local defaults:

- Port base: \`${supabaseLocalPorts.base}\`
- API: \`http://127.0.0.1:${supabaseLocalPorts.api}\`
- DB: \`127.0.0.1:${supabaseLocalPorts.db}\`
- Studio: \`http://127.0.0.1:${supabaseLocalPorts.studio}\`
- Inbucket: \`http://127.0.0.1:${supabaseLocalPorts.inbucket}\`
- Analytics: \`http://127.0.0.1:${supabaseLocalPorts.analytics}\`
- Shadow DB: \`127.0.0.1:${supabaseLocalPorts.shadow}\`

Override with:

- \`SUPABASE_LOCAL_PORT_BASE\`
- \`SUPABASE_LOCAL_API_PORT\`
- \`SUPABASE_LOCAL_DB_PORT\`
- \`SUPABASE_LOCAL_STUDIO_PORT\`
- \`SUPABASE_LOCAL_INBUCKET_PORT\`
- \`SUPABASE_LOCAL_ANALYTICS_PORT\`
- \`SUPABASE_LOCAL_SHADOW_PORT\`

Build flow:

- \`./scripts/up.sh\` calls \`./scripts/build-app-image.sh\` when \`APP_BUILD_ENABLED=true\`.
- Supabase local project root: \`infra/minikube\`${supabaseLocalEnabled ? '' : ' (unused unless Supabase-backed auth/database/storage is enabled)'}.
- Supabase local project identity: \`${supabaseProjectId ?? 'unused'}\`; existing local configs with another \`project_id\` must be destroyed and recreated manually.
- Immutable migrations live in \`supabase/migrations/\` and are applied with \`supabase migration up --local\`.
${profileModel.enabled ? '- Generated profile desired-state reconciliation lives in `supabase/generated/auth_profiles.sql` and records checksum state in `ankhorage_internal.generated_schema_state`.\n' : ''}- \`./scripts/supabase-local-env.sh\` can populate Supabase keys in \`.env\` from local \`supabase status -o env\`.
- \`./scripts/supabase-local-env.sh\` writes \`EXPO_PUBLIC_SUPABASE_URL\` + \`EXPO_PUBLIC_SUPABASE_ANON_KEY\` into \`$APP_SOURCE_DIR/.env.local\` (e.g. \`apps/card/.env.local\`) for local app runs.
- With \`AUTH_RUNTIME_MODE=local\` (default), \`up.sh\` runs \`supabase-local-env.sh\` before app/Kubernetes startup when Supabase-backed local services are enabled.
- \`supabase-local-env.sh\` checks configured host ports before starting a missing local Supabase stack.
- \`build-app-image.sh\` runs \`bunx expo export --platform web\` from app source.
- \`app-image/Dockerfile\` builds an nginx image from exported web artifacts.
- \`build-app-image.sh\` labels the generated Docker image with Ankhorage metadata for diagnostics.
- \`up.sh\` syncs runtime image by strategy:
  - \`APP_IMAGE_SYNC_STRATEGY=docker-load\` (default): load prebuilt local Docker image into Minikube.
  - \`APP_IMAGE_SYNC_STRATEGY=minikube-build\`: build directly into Minikube image store.
  - \`APP_IMAGE_SYNC_STRATEGY=none\`: skip local image sync.
- \`up.sh\` applies image/replica changes and (by default) restarts \`deployment/app-runtime\`.
- If Supabase keys are provided, \`up.sh\` syncs \`Secret/supabase-auth-secrets\` from env.

Default generated app image tag: \`${defaultAppImage}\`.

## Notes

- Auth/database/authorization resources are generated in adapter modules.
- Cerbos route/screen policies derive from app navigator + authFlow intent when available.
- Re-generate infra by saving the manifest or calling the bridge infra endpoint.
`;
}

function getEnvExample(args: {
  namespace: string;
  domain: string;
  extraEnvEntries: string[];
  defaultAppImage: string;
  supabaseLocalPorts: SupabaseLocalPorts;
  supabaseLocalEnabled: boolean;
}): string {
  const { namespace, domain, extraEnvEntries, defaultAppImage, supabaseLocalPorts } = args;

  const baseEntries = [
    '# Minikube runtime configuration',
    `ANKH_NAMESPACE=${namespace}`,
    'MINIKUBE_PROFILE=minikube',
    'MINIKUBE_DRIVER=docker',
    'APP_BUILD_ENABLED=true',
    'APP_SOURCE_DIR=',
    'APP_WEB_EXPORT_DIR=.ankh/web-export',
    '# Canonical Supabase project root. Leave empty to use infra/minikube.',
    'SUPABASE_PROJECT_DIR=',
    `SUPABASE_LOCAL_PORT_BASE=${supabaseLocalPorts.base}`,
    `SUPABASE_LOCAL_SHADOW_PORT=${supabaseLocalPorts.shadow}`,
    `SUPABASE_LOCAL_API_PORT=${supabaseLocalPorts.api}`,
    `SUPABASE_LOCAL_DB_PORT=${supabaseLocalPorts.db}`,
    `SUPABASE_LOCAL_STUDIO_PORT=${supabaseLocalPorts.studio}`,
    `SUPABASE_LOCAL_INBUCKET_PORT=${supabaseLocalPorts.inbucket}`,
    `SUPABASE_LOCAL_ANALYTICS_PORT=${supabaseLocalPorts.analytics}`,
    `APP_IMAGE=${defaultAppImage}`,
    'APP_IMAGE_SYNC_STRATEGY=docker-load',
    'APP_IMAGE_CLEANUP_ON_DOWN=true',
    'APP_IMAGE_CLEANUP_MINIKUBE=true',
    'APP_IMAGE_CLEANUP_DOCKER=true',
    'AUTH_RUNTIME_MODE=local',
    'APP_PORT_FORWARD_LOCAL_PORT=18080',
    'APP_PORT_FORWARD_REMOTE_PORT=80',
    'APP_REPLICAS=1',
    'APP_FORCE_ROLLOUT_RESTART=true',
    '',
    '# Optional private registry auth for APP_IMAGE',
    'APP_IMAGE_PULL_SECRET_NAME=',
    'APP_IMAGE_PULL_SECRET_SERVER=ghcr.io',
    'APP_IMAGE_PULL_SECRET_USERNAME=',
    'APP_IMAGE_PULL_SECRET_PASSWORD=',
    'APP_IMAGE_PULL_SECRET_EMAIL=',
    '',
    '# Optional app networking domain',
    `APP_DOMAIN=${domain}`,
    '',
    '# Adapter-provided runtime keys',
  ];

  const merged = [...baseEntries, ...extraEnvEntries];
  const unique: string[] = [];
  for (const entry of merged) {
    if (!unique.includes(entry)) unique.push(entry);
  }

  return `${unique.join('\n')}\n`;
}

function getNamespaceManifest(namespace: string): string {
  return `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
  labels:
    app.kubernetes.io/part-of: ankhorage
`;
}

function getAppConfigMap(args: {
  namespace: string;
  authScope: string;
  authProvider: string;
  databaseProvider: string;
  secretStoreProvider: string;
  storageMetadata: AppInfraStorageMetadata | null;
  monitoringEnabled: boolean;
  domain: string;
}): string {
  const {
    namespace,
    authScope,
    authProvider,
    databaseProvider,
    secretStoreProvider,
    storageMetadata,
    monitoringEnabled,
    domain,
  } = args;

  const storageLines = storageMetadata
    ? `  STORAGE_PROVIDER: "${storageMetadata.provider}"
  STORAGE_BUCKETS: "${escapeYamlDoubleQuoted(storageMetadata.bucketsCsv)}"
  STORAGE_DEFAULT_BUCKET: "${escapeYamlDoubleQuoted(storageMetadata.defaultBucket)}"
`
    : '';

  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: app-infra-config
  namespace: ${namespace}
data:
  DEPLOYMENT_TARGET: "minikube"
  MONITORING_ENABLED: "${monitoringEnabled ? 'true' : 'false'}"
  AUTH_SCOPE: "${authScope}"
  AUTH_PROVIDER: "${authProvider}"
  DATABASE_PROVIDER: "${databaseProvider}"
  SECRET_STORE_PROVIDER: "${secretStoreProvider}"
${storageLines}  NETWORK_DOMAIN: "${domain}"
`;
}

function resolveAppInfraStorageMetadata(
  manifest: InfraManifestInput,
): AppInfraStorageMetadata | null {
  const spec = manifest.storage;
  if (!spec) return null;

  const buckets = normalizeBuckets(spec.buckets);
  if (buckets.length === 0) return null;
  const [defaultBucket] = buckets;
  if (!defaultBucket) return null;

  if (spec.provider === 'supabase') {
    return {
      provider: 'supabase',
      bucketsCsv: buckets.join(','),
      defaultBucket,
    };
  }

  if (spec.provider === 'auto') {
    const shouldResolveToSupabase =
      manifest.database?.provider === 'supabase' || manifest.auth?.provider === 'supabase';

    if (!shouldResolveToSupabase) return null;

    return {
      provider: 'supabase',
      bucketsCsv: buckets.join(','),
      defaultBucket,
    };
  }

  return null;
}

function normalizeBuckets(rawBuckets: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawBuckets) {
    const bucket = raw.trim();
    if (!bucket) continue;
    if (seen.has(bucket)) continue;
    seen.add(bucket);
    normalized.push(bucket);
  }

  return normalized;
}

function escapeYamlDoubleQuoted(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function getKustomizationManifest(extraResources: string[]): string {
  const resources = [
    'namespace.yaml',
    'app.configmap.yaml',
    'app/deployment.yaml',
    'app/service.yaml',
    ...extraResources,
  ];
  const resourceLines = resources.map((r) => `  - ${r}`).join('\n');

  return `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
${resourceLines}
`;
}

function getAppDeploymentManifest(args: { namespace: string; defaultAppImage: string }): string {
  const { namespace, defaultAppImage } = args;

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-runtime
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: app-runtime
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: app-runtime
  template:
    metadata:
      labels:
        app.kubernetes.io/name: app-runtime
    spec:
      containers:
        - name: app
          image: ${defaultAppImage}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
              name: http
          envFrom:
            - configMapRef:
                name: app-infra-config
            - configMapRef:
                name: app-runtime-auth-env
                optional: true
            - configMapRef:
                name: app-runtime-storage-env
                optional: true
            - secretRef:
                name: supabase-auth-secrets
                optional: true
          readinessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 15
            periodSeconds: 20
`;
}

function getAppServiceManifest(namespace: string): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: app-runtime
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: app-runtime
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: app-runtime
  ports:
    - name: http
      port: 80
      targetPort: http
`;
}

function getUpScript(args: {
  defaultNamespace: string;
  defaultAppImage: string;
  supabaseLocalEnabled: boolean;
}): string {
  const { defaultNamespace, defaultAppImage, supabaseLocalEnabled } = args;

  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"
K8S_DIR="\${ROOT_DIR}/k8s"
BUILD_SCRIPT="\${SCRIPT_DIR}/build-app-image.sh"

if [[ -f "\${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\${ROOT_DIR}/.env"
  set +a
fi

PROFILE="\${MINIKUBE_PROFILE:-minikube}"
DRIVER="\${MINIKUBE_DRIVER:-docker}"
NAMESPACE="\${ANKH_NAMESPACE:-${defaultNamespace}}"
APP_BUILD_ENABLED="\${APP_BUILD_ENABLED:-true}"
APP_SOURCE_DIR="\${APP_SOURCE_DIR:-$(cd "\${ROOT_DIR}/../.." && pwd)}"
APP_WEB_EXPORT_DIR="\${APP_WEB_EXPORT_DIR:-.ankh/web-export}"
APP_IMAGE="\${APP_IMAGE:-${defaultAppImage}}"
APP_IMAGE_SYNC_STRATEGY="\${APP_IMAGE_SYNC_STRATEGY:-docker-load}"
APP_REPLICAS="\${APP_REPLICAS:-1}"
APP_FORCE_ROLLOUT_RESTART="\${APP_FORCE_ROLLOUT_RESTART:-true}"
APP_IMAGE_PULL_SECRET_NAME="\${APP_IMAGE_PULL_SECRET_NAME:-}"
APP_IMAGE_PULL_SECRET_SERVER="\${APP_IMAGE_PULL_SECRET_SERVER:-ghcr.io}"
APP_IMAGE_PULL_SECRET_USERNAME="\${APP_IMAGE_PULL_SECRET_USERNAME:-}"
APP_IMAGE_PULL_SECRET_PASSWORD="\${APP_IMAGE_PULL_SECRET_PASSWORD:-}"
APP_IMAGE_PULL_SECRET_EMAIL="\${APP_IMAGE_PULL_SECRET_EMAIL:-}"
AUTH_RUNTIME_MODE="\${AUTH_RUNTIME_MODE:-local}"
SUPABASE_LOCAL_ENABLED="\${SUPABASE_LOCAL_ENABLED:-${supabaseLocalEnabled ? 'true' : 'false'}}"
SUPABASE_SECRET_SYNC_ENABLED="\${SUPABASE_SECRET_SYNC_ENABLED:-true}"
SUPABASE_LOCAL_ENV_SCRIPT="\${SCRIPT_DIR}/supabase-local-env.sh"
SUPABASE_URL="\${SUPABASE_URL:-}"
SUPABASE_ANON_KEY="\${SUPABASE_ANON_KEY:-}"
SUPABASE_SERVICE_ROLE_KEY="\${SUPABASE_SERVICE_ROLE_KEY:-}"
SUPABASE_JWT_SECRET="\${SUPABASE_JWT_SECRET:-}"
SUPABASE_PUBLIC_URL="\${EXPO_PUBLIC_SUPABASE_URL:-\${SUPABASE_URL}}"
SUPABASE_PUBLIC_ANON_KEY="\${EXPO_PUBLIC_SUPABASE_ANON_KEY:-\${SUPABASE_ANON_KEY}}"

refresh_supabase_env() {
  SUPABASE_URL="\${SUPABASE_URL:-}"
  SUPABASE_ANON_KEY="\${SUPABASE_ANON_KEY:-}"
  SUPABASE_SERVICE_ROLE_KEY="\${SUPABASE_SERVICE_ROLE_KEY:-}"
  SUPABASE_JWT_SECRET="\${SUPABASE_JWT_SECRET:-}"
  SUPABASE_PUBLIC_URL="\${EXPO_PUBLIC_SUPABASE_URL:-\${SUPABASE_URL}}"
  SUPABASE_PUBLIC_ANON_KEY="\${EXPO_PUBLIC_SUPABASE_ANON_KEY:-\${SUPABASE_ANON_KEY}}"
}

has_required_supabase_env() {
  [[ -n "\${SUPABASE_URL}" && -n "\${SUPABASE_ANON_KEY}" && -n "\${SUPABASE_SERVICE_ROLE_KEY}" && -n "\${SUPABASE_JWT_SECRET}" ]]
}

refresh_supabase_env

if [[ "\${AUTH_RUNTIME_MODE}" != "local" && "\${AUTH_RUNTIME_MODE}" != "remote" ]]; then
  echo "Unsupported AUTH_RUNTIME_MODE=\${AUTH_RUNTIME_MODE}. Use local or remote."
  exit 1
fi

if ! command -v minikube >/dev/null 2>&1; then
  echo "minikube is required but not installed."
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required but not installed."
  exit 1
fi

HOST_STATUS="$(minikube -p "\${PROFILE}" status --format='{{.Host}}' 2>/dev/null || true)"
if [[ "\${HOST_STATUS}" != "Running" ]]; then
  minikube start -p "\${PROFILE}" --driver="\${DRIVER}"
fi

if [[ "\${AUTH_RUNTIME_MODE}" == "local" && "\${SUPABASE_LOCAL_ENABLED}" == "true" ]]; then
  if [[ ! -x "\${SUPABASE_LOCAL_ENV_SCRIPT}" ]]; then
    echo "Supabase local bootstrap failed: missing executable \${SUPABASE_LOCAL_ENV_SCRIPT}."
    exit 1
  else
    echo "Running local Supabase bootstrap, immutable migrations, generated reconciliation, and schema verification."
    if ! "\${SUPABASE_LOCAL_ENV_SCRIPT}"; then
      echo "Supabase local bootstrap failed."
      exit 1
    fi
    if [[ -f "\${ROOT_DIR}/.env" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "\${ROOT_DIR}/.env"
      set +a
    fi
    refresh_supabase_env
  fi
fi

if [[ "\${APP_BUILD_ENABLED}" == "true" ]]; then
  if [[ ! -x "\${BUILD_SCRIPT}" ]]; then
    echo "Missing build helper script: \${BUILD_SCRIPT}"
    exit 1
  fi

  "\${BUILD_SCRIPT}"
fi

if [[ "\${APP_WEB_EXPORT_DIR}" = /* ]]; then
  EXPORT_DIR="\${APP_WEB_EXPORT_DIR}"
else
  EXPORT_DIR="\${APP_SOURCE_DIR}/\${APP_WEB_EXPORT_DIR}"
fi

docker_load_image_to_minikube() {
  if command -v docker >/dev/null 2>&1 && docker image inspect "\${APP_IMAGE}" >/dev/null 2>&1; then
    minikube -p "\${PROFILE}" image load --daemon=true --overwrite=true "\${APP_IMAGE}" >/dev/null
    return 0
  fi

  return 1
}

case "\${APP_IMAGE_SYNC_STRATEGY}" in
  minikube-build)
    if [[ ! -f "\${EXPORT_DIR}/index.html" ]]; then
      echo "Expected web export output not found at \${EXPORT_DIR}/index.html"
      echo "Run build-app-image.sh first or switch APP_IMAGE_SYNC_STRATEGY=docker-load."
      exit 1
    fi

    if minikube -p "\${PROFILE}" image build -t "\${APP_IMAGE}" -f "\${ROOT_DIR}/app-image/Dockerfile" "\${EXPORT_DIR}" >/dev/null; then
      if ! minikube -p "\${PROFILE}" image ls 2>/dev/null | grep -Fq "\${APP_IMAGE}"; then
        echo "minikube image build did not register \${APP_IMAGE}; falling back to docker-load."
        if ! docker_load_image_to_minikube; then
          echo "Fallback docker-load failed: local Docker image \${APP_IMAGE} not found."
          exit 1
        fi
      fi
    else
      echo "minikube image build failed for \${APP_IMAGE}; falling back to docker-load."
      if ! docker_load_image_to_minikube; then
        echo "Fallback docker-load failed: local Docker image \${APP_IMAGE} not found."
        exit 1
      fi
    fi
    ;;
  docker-load)
    if ! docker_load_image_to_minikube; then
      echo "Skipping docker-load image sync; local Docker image \${APP_IMAGE} not found."
    fi
    ;;
  none)
    echo "Skipping local image sync (APP_IMAGE_SYNC_STRATEGY=none)."
    ;;
  *)
    echo "Unsupported APP_IMAGE_SYNC_STRATEGY=\${APP_IMAGE_SYNC_STRATEGY}. Use minikube-build, docker-load, or none."
    exit 1
    ;;
esac

kubectl apply -k "\${K8S_DIR}"

if [[ "\${SUPABASE_SECRET_SYNC_ENABLED}" == "true" ]]; then
  if ! has_required_supabase_env && [[ "\${AUTH_RUNTIME_MODE}" == "local" && "\${SUPABASE_LOCAL_ENABLED}" == "true" ]]; then
    if [[ ! -x "\${SUPABASE_LOCAL_ENV_SCRIPT}" ]]; then
      echo "Supabase local bootstrap failed: missing executable \${SUPABASE_LOCAL_ENV_SCRIPT}."
      exit 1
    else
      echo "Supabase keys missing; running \${SUPABASE_LOCAL_ENV_SCRIPT}."
      if ! "\${SUPABASE_LOCAL_ENV_SCRIPT}"; then
        echo "Supabase local bootstrap failed."
        exit 1
      fi
      if [[ -f "\${ROOT_DIR}/.env" ]]; then
        set -a
        # shellcheck disable=SC1090
        source "\${ROOT_DIR}/.env"
        set +a
      fi
      refresh_supabase_env
    fi
  fi

  if ! has_required_supabase_env; then
    if [[ "\${AUTH_RUNTIME_MODE}" == "local" ]]; then
      echo "Supabase secret sync skipped: local credentials still missing after bootstrap."
      echo "Run ./scripts/supabase-local-env.sh and retry."
    else
      echo "Supabase secret sync skipped: set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_JWT_SECRET in .env."
    fi
  else
    TMP_SUPABASE_ENV_FILE="$(mktemp)"
    trap 'rm -f "\${TMP_SUPABASE_ENV_FILE}"' EXIT

    cat > "\${TMP_SUPABASE_ENV_FILE}" <<EOF
SUPABASE_URL=\${SUPABASE_URL}
SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=\${SUPABASE_SERVICE_ROLE_KEY}
SUPABASE_JWT_SECRET=\${SUPABASE_JWT_SECRET}
EXPO_PUBLIC_SUPABASE_URL=\${SUPABASE_PUBLIC_URL}
EXPO_PUBLIC_SUPABASE_ANON_KEY=\${SUPABASE_PUBLIC_ANON_KEY}
EOF

    kubectl -n "\${NAMESPACE}" create secret generic supabase-auth-secrets --from-env-file="\${TMP_SUPABASE_ENV_FILE}" --dry-run=client -o yaml | kubectl -n "\${NAMESPACE}" apply -f -

    rm -f "\${TMP_SUPABASE_ENV_FILE}"
    trap - EXIT
    echo "Synchronized supabase-auth-secrets from environment values."
  fi
fi

if [[ -n "\${APP_IMAGE_PULL_SECRET_NAME}" ]]; then
  if [[ -z "\${APP_IMAGE_PULL_SECRET_USERNAME}" || -z "\${APP_IMAGE_PULL_SECRET_PASSWORD}" ]]; then
    echo "APP_IMAGE_PULL_SECRET_NAME is set, but username/password are missing."
    exit 1
  fi

  SECRET_EMAIL_ARG=()
  if [[ -n "\${APP_IMAGE_PULL_SECRET_EMAIL}" ]]; then
    SECRET_EMAIL_ARG=(--docker-email="\${APP_IMAGE_PULL_SECRET_EMAIL}")
  fi

  kubectl -n "\${NAMESPACE}" create secret docker-registry "\${APP_IMAGE_PULL_SECRET_NAME}" --docker-server="\${APP_IMAGE_PULL_SECRET_SERVER}" --docker-username="\${APP_IMAGE_PULL_SECRET_USERNAME}" --docker-password="\${APP_IMAGE_PULL_SECRET_PASSWORD}" "\${SECRET_EMAIL_ARG[@]}" --dry-run=client -o yaml | kubectl -n "\${NAMESPACE}" apply -f -

  PULL_SECRET_PATCH="$(cat <<EOF
{"spec":{"template":{"spec":{"imagePullSecrets":[{"name":"\${APP_IMAGE_PULL_SECRET_NAME}"}]}}}}
EOF
)"
  kubectl -n "\${NAMESPACE}" patch deployment app-runtime --type=merge --patch "\${PULL_SECRET_PATCH}" >/dev/null
else
  kubectl -n "\${NAMESPACE}" patch deployment app-runtime --type=json --patch='[{"op":"remove","path":"/spec/template/spec/imagePullSecrets"}]' >/dev/null 2>&1 || true
fi

kubectl -n "\${NAMESPACE}" set image deployment/app-runtime app="\${APP_IMAGE}" >/dev/null
kubectl -n "\${NAMESPACE}" scale deployment/app-runtime --replicas="\${APP_REPLICAS}" >/dev/null

if [[ "\${APP_FORCE_ROLLOUT_RESTART}" == "true" ]]; then
  kubectl -n "\${NAMESPACE}" rollout restart deployment/app-runtime >/dev/null
fi

kubectl -n "\${NAMESPACE}" rollout status deployment/app-runtime --timeout=180s >/dev/null
echo "Minikube infrastructure applied."
`;
}

function getBuildAppImageScript(args: {
  defaultNamespace: string;
  defaultAppImage: string;
}): string {
  const { defaultNamespace, defaultAppImage } = args;

  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"
DOCKERFILE_PATH="\${ROOT_DIR}/app-image/Dockerfile"

if [[ -f "\${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\${ROOT_DIR}/.env"
  set +a
fi

NAMESPACE="\${ANKH_NAMESPACE:-${defaultNamespace}}"
APP_BUILD_ENABLED="\${APP_BUILD_ENABLED:-true}"
APP_SOURCE_DIR="\${APP_SOURCE_DIR:-$(cd "\${ROOT_DIR}/../.." && pwd)}"
APP_WEB_EXPORT_DIR="\${APP_WEB_EXPORT_DIR:-.ankh/web-export}"
APP_IMAGE="\${APP_IMAGE:-${defaultAppImage}}"

if [[ "\${APP_BUILD_ENABLED}" != "true" ]]; then
  echo "Skipping app image build (APP_BUILD_ENABLED=\${APP_BUILD_ENABLED})."
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to build app image."
  exit 1
fi

if ! command -v bunx >/dev/null 2>&1; then
  echo "bunx is required to export the app for container image build."
  exit 1
fi

if [[ ! -f "\${APP_SOURCE_DIR}/package.json" ]]; then
  echo "APP_SOURCE_DIR does not look like an app root: \${APP_SOURCE_DIR}"
  exit 1
fi

if [[ ! -f "\${DOCKERFILE_PATH}" ]]; then
  echo "Dockerfile for app image build is missing: \${DOCKERFILE_PATH}"
  exit 1
fi

(
  cd "\${APP_SOURCE_DIR}"
  bunx expo export --platform web --output-dir "\${APP_WEB_EXPORT_DIR}"
)

if [[ "\${APP_WEB_EXPORT_DIR}" = /* ]]; then
  EXPORT_DIR="\${APP_WEB_EXPORT_DIR}"
else
  EXPORT_DIR="\${APP_SOURCE_DIR}/\${APP_WEB_EXPORT_DIR}"
fi

if [[ ! -f "\${EXPORT_DIR}/index.html" ]]; then
  echo "Expected web export output not found at \${EXPORT_DIR}/index.html"
  exit 1
fi

docker build -t "\${APP_IMAGE}" \
  --label "ankhorage.kind=generated-app" \
  --label "ankhorage.namespace=\${NAMESPACE}" \
  --label "ankhorage.image=\${APP_IMAGE}" \
  -f "\${DOCKERFILE_PATH}" \
  "\${EXPORT_DIR}"
echo "Built app image: \${APP_IMAGE} (namespace: \${NAMESPACE})"
`;
}

function getAppImageDockerfile(): string {
  return `FROM nginx:1.27-alpine

RUN cat <<'EOF' > /etc/nginx/conf.d/default.conf
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

COPY . /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
`;
}

function getPortForwardScript(defaultNamespace: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"

if [[ -f "\${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\${ROOT_DIR}/.env"
  set +a
fi

NAMESPACE="\${ANKH_NAMESPACE:-${defaultNamespace}}"
LOCAL_PORT="\${APP_PORT_FORWARD_LOCAL_PORT:-18080}"
REMOTE_PORT="\${APP_PORT_FORWARD_REMOTE_PORT:-80}"

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required but not installed."
  exit 1
fi

if ! kubectl get namespace "\${NAMESPACE}" >/dev/null 2>&1; then
  echo "Namespace '\${NAMESPACE}' was not found."
  echo "Run ./scripts/up.sh to create infrastructure first."
  exit 1
fi

if ! kubectl -n "\${NAMESPACE}" get service app-runtime >/dev/null 2>&1; then
  echo "Service 'app-runtime' was not found in namespace '\${NAMESPACE}'."
  echo "Run ./scripts/up.sh to apply runtime resources."
  exit 1
fi

echo "Forwarding app-runtime from namespace '\${NAMESPACE}' to http://127.0.0.1:\${LOCAL_PORT}"
echo "Press Ctrl+C to stop."
kubectl -n "\${NAMESPACE}" port-forward service/app-runtime "\${LOCAL_PORT}:\${REMOTE_PORT}"
`;
}

function getDownScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"
K8S_DIR="\${ROOT_DIR}/k8s"

if [[ -f "\${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\${ROOT_DIR}/.env"
  set +a
fi

kubectl delete -k "\${K8S_DIR}" --ignore-not-found
echo "Minikube infrastructure removed."
`;
}

function getSupabaseProfileChecksumSql(profileModel: ResolvedProfileModel): string {
  return `do $$
declare
  actual_hash text;
  actual_table_name text;
begin
  if to_regclass('ankhorage_internal.generated_schema_state') is null then
    raise exception 'missing ankhorage_internal.generated_schema_state';
  end if;

  select content_hash, table_name
    into actual_hash, actual_table_name
    from ankhorage_internal.generated_schema_state
    where artifact_key = 'auth.profile';

  if actual_hash is null then
    raise exception 'missing generated schema state for auth.profile';
  end if;

  if actual_table_name <> '${escapeSqlLiteral(profileModel.table)}' then
    raise exception 'generated schema state table mismatch for auth.profile: expected %, found %', '${escapeSqlLiteral(profileModel.table)}', actual_table_name;
  end if;

  if actual_hash <> '${escapeSqlLiteral(profileModel.desiredStateHash)}' then
    raise exception 'stale generated schema state for auth.profile: expected %, found %', '${escapeSqlLiteral(profileModel.desiredStateHash)}', actual_hash;
  end if;
end;
$$;`;
}

function getSupabaseProfileDisabledGuardSql(): string {
  return `do $$
begin
  if to_regclass('ankhorage_internal.generated_schema_state') is not null
    and exists (
      select 1
      from ankhorage_internal.generated_schema_state
      where artifact_key = 'auth.profile'
    ) then
    raise exception 'manifest auth.profile.table was removed but local generated auth.profile state still exists; reset local Supabase or add an explicit cleanup migration';
  end if;
end;
$$;`;
}

function getSupabaseProfileVerificationSql(profileModel: ResolvedProfileModel): string {
  const configuredColumns = profileModel.columns.map((column) => column.column);
  const configuredArray = getSqlTextArray(configuredColumns);
  const managedArray = getSqlTextArray(MANAGED_PROFILE_COLUMNS);
  const updateGrantArray = getSqlTextArray(configuredColumns);
  const protectedUpdateColumnsArray = getSqlTextArray(['id', 'created_at', 'updated_at', 'role']);
  const table = escapeSqlLiteral(profileModel.table);
  const selectPolicy = escapeSqlLiteral(`${profileModel.table}_select_own`);
  const updatePolicy = escapeSqlLiteral(`${profileModel.table}_update_own`);
  const triggerName = escapeSqlLiteral(`on_auth_user_created_${profileModel.table}`);
  const functionName = escapeSqlLiteral(`handle_new_${profileModel.table}_user`);
  const triggerCheck =
    profileModel.createStrategy === 'trigger'
      ? `  if not exists (
    select 1
    from pg_trigger t
    join pg_class rel on rel.oid = t.tgrelid
    join pg_namespace rel_ns on rel_ns.oid = rel.relnamespace
    join pg_proc fn on fn.oid = t.tgfoid
    join pg_namespace fn_ns on fn_ns.oid = fn.pronamespace
    where rel_ns.nspname = 'auth'
      and rel.relname = 'users'
      and t.tgname = '${triggerName}'
      and not t.tgisinternal
      and t.tgenabled = 'O'
      and (t.tgtype::integer & 1) = 1
      and (t.tgtype::integer & 4) = 4
      and (t.tgtype::integer & (2 | 8 | 16 | 32)) = 0
      and fn_ns.nspname = 'public'
      and fn.proname = '${functionName}'
  ) then
    raise exception 'missing generated new-user profile trigger';
  end if;`
      : `  if exists (
    select 1
    from pg_trigger t
    join pg_class rel on rel.oid = t.tgrelid
    join pg_namespace rel_ns on rel_ns.oid = rel.relnamespace
    where rel_ns.nspname = 'auth'
      and rel.relname = 'users'
      and t.tgname = '${triggerName}'
      and not t.tgisinternal
  ) then
    raise exception 'generated new-user profile trigger exists but createStrategy is not trigger';
  end if;`;

  return `do $$
declare
  profile_table constant text := '${table}';
  configured_columns constant text[] := ${configuredArray};
  managed_columns constant text[] := ${managedArray};
  expected_column text;
begin
  if to_regclass('auth.users') is null then
    raise exception 'missing auth.users';
  end if;

  if to_regclass('public.users') is not null then
    raise exception 'reserved conflicting identity table public.users exists';
  end if;

  if to_regclass(format('public.%I', profile_table)) is null then
    raise exception 'missing configured profile table public.%', profile_table;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = format('public.%I', profile_table)::regclass
      and c.contype = 'p'
      and c.conkey = array[
        (
          select a.attnum
          from pg_attribute a
          where a.attrelid = format('public.%I', profile_table)::regclass
            and a.attname = 'id'
            and not a.attisdropped
        )
      ]::smallint[]
  ) then
    raise exception 'profile table primary key must be exactly id';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = format('public.%I', profile_table)::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.contype = 'f'
      and c.confdeltype = 'c'
      and c.conkey = array[
        (
          select a.attnum
          from pg_attribute a
          where a.attrelid = format('public.%I', profile_table)::regclass
            and a.attname = 'id'
            and not a.attisdropped
        )
      ]::smallint[]
      and c.confkey = array[
        (
          select a.attnum
          from pg_attribute a
          where a.attrelid = 'auth.users'::regclass
            and a.attname = 'id'
            and not a.attisdropped
        )
      ]::smallint[]
  ) then
    raise exception 'profile id must reference auth.users(id) with cascade delete';
  end if;

  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = profile_table
      and c.column_name = 'id'
      and c.udt_name = 'uuid'
      and c.is_nullable = 'NO'
  ) then
    raise exception 'profile id column must be uuid not null';
  end if;

  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = profile_table
      and c.column_name = 'created_at'
      and c.data_type = 'timestamp with time zone'
      and c.is_nullable = 'NO'
      and c.column_default = 'now()'
  ) then
    raise exception 'profile created_at column must be timestamptz not null default now()';
  end if;

  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = profile_table
      and c.column_name = 'updated_at'
      and c.data_type = 'timestamp with time zone'
      and c.is_nullable = 'NO'
      and c.column_default = 'now()'
  ) then
    raise exception 'profile updated_at column must be timestamptz not null default now()';
  end if;

  foreach expected_column in array configured_columns loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = profile_table
        and c.column_name = expected_column
        and c.data_type = 'text'
    ) then
      raise exception 'missing configured managed profile column %', expected_column;
    end if;
  end loop;

  foreach expected_column in array managed_columns loop
    if not expected_column = any(configured_columns) and exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = profile_table
        and c.column_name = expected_column
    ) then
      raise exception 'stale managed profile column % exists', expected_column;
    end if;
  end loop;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = profile_table
      and column_name = 'role'
  ) then
    raise exception 'generated role column must not exist';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = profile_table
      and c.relrowsecurity
  ) then
    raise exception 'profile table RLS is not enabled';
  end if;

  if not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = profile_table
      and p.polname = '${selectPolicy}'
      and p.polcmd = 'r'
      and p.polroles = array['authenticated'::regrole]::oid[]
      and regexp_replace(lower(pg_get_expr(p.polqual, p.polrelid)), '[[:space:]()]', '', 'g') in (
        'auth.uid=id',
        'auth.uid=' || profile_table || '.id',
        'selectauth.uidasuid=id',
        'selectauth.uidasuid=' || profile_table || '.id'
      )
      and p.polwithcheck is null
  ) then
    raise exception 'own-profile SELECT policy is missing or has unsafe definition';
  end if;

  if not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = profile_table
      and p.polname = '${updatePolicy}'
      and p.polcmd = 'w'
      and p.polroles = array['authenticated'::regrole]::oid[]
      and regexp_replace(lower(pg_get_expr(p.polqual, p.polrelid)), '[[:space:]()]', '', 'g') in (
        'auth.uid=id',
        'auth.uid=' || profile_table || '.id',
        'selectauth.uidasuid=id',
        'selectauth.uidasuid=' || profile_table || '.id'
      )
      and regexp_replace(lower(pg_get_expr(p.polwithcheck, p.polrelid)), '[[:space:]()]', '', 'g') in (
        'auth.uid=id',
        'auth.uid=' || profile_table || '.id',
        'selectauth.uidasuid=id',
        'selectauth.uidasuid=' || profile_table || '.id'
      )
  ) then
    raise exception 'own-profile UPDATE policy is missing or has unsafe definition';
  end if;

  if exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = profile_table
      and p.polname not in ('${selectPolicy}', '${updatePolicy}')
  ) then
    raise exception 'unexpected profile table RLS policy exists';
  end if;

  if has_any_column_privilege('anon', format('public.%I', profile_table), 'SELECT')
    or has_any_column_privilege('anon', format('public.%I', profile_table), 'INSERT')
    or has_any_column_privilege('anon', format('public.%I', profile_table), 'UPDATE')
    or has_any_column_privilege('anon', format('public.%I', profile_table), 'REFERENCES')
    or has_table_privilege('anon', format('public.%I', profile_table), 'DELETE') then
    raise exception 'anon must not have profile table privileges';
  end if;

  if not has_table_privilege('authenticated', format('public.%I', profile_table), 'SELECT') then
    raise exception 'authenticated role must have profile table SELECT privilege';
  end if;

  if has_any_column_privilege('authenticated', format('public.%I', profile_table), 'INSERT')
    or has_any_column_privilege('authenticated', format('public.%I', profile_table), 'REFERENCES')
    or has_table_privilege('authenticated', format('public.%I', profile_table), 'DELETE') then
    raise exception 'authenticated role must not have profile table INSERT, DELETE, or REFERENCES privilege';
  end if;

  foreach expected_column in array ${updateGrantArray} loop
    if not has_column_privilege('authenticated', format('public.%I', profile_table), expected_column, 'UPDATE') then
      raise exception 'authenticated role is missing UPDATE privilege on configured profile column %', expected_column;
    end if;
  end loop;

  foreach expected_column in array (
    select array_agg(c.column_name::text order by c.ordinal_position)
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = profile_table
  ) loop
    if not expected_column = any(configured_columns)
      and has_column_privilege('authenticated', format('public.%I', profile_table), expected_column, 'UPDATE') then
      raise exception 'authenticated role has unexpected UPDATE privilege on profile column %', expected_column;
    end if;
  end loop;

  foreach expected_column in array ${protectedUpdateColumnsArray} loop
    if exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = profile_table
        and c.column_name = expected_column
    ) and has_column_privilege('authenticated', format('public.%I', profile_table), expected_column, 'UPDATE') then
      raise exception 'authenticated role must not have UPDATE privilege on protected profile column %', expected_column;
    end if;
  end loop;

${triggerCheck}

  if '${profileModel.createStrategy}' = 'trigger' then
    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = '${functionName}'
        and p.prosecdef
        and p.prorettype = 'trigger'::regtype
        and p.proconfig @> array['search_path=pg_catalog, pg_temp']
    ) then
      raise exception 'generated trigger function is missing required SECURITY DEFINER properties';
    end if;

    if exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where n.nspname = 'public'
        and p.proname = '${functionName}'
        and acl.privilege_type = 'EXECUTE'
        and (
          acl.grantee = 0
          or acl.grantee = 'anon'::regrole
          or acl.grantee = 'authenticated'::regrole
        )
    ) then
      raise exception 'generated trigger function execute privilege must be revoked from PUBLIC, anon, and authenticated';
    end if;
  end if;
end;
$$;`;
}

function getStatusScript(args: {
  defaultNamespace: string;
  supabaseProjectId: string | null;
  supabaseLocalEnabled: boolean;
  profileModel: ResolvedProfileModel;
}): string {
  const { defaultNamespace, supabaseProjectId, supabaseLocalEnabled, profileModel } = args;
  const profileStatusSql = profileModel.enabled ? getSupabaseProfileChecksumSql(profileModel) : '';
  const profileVerificationSql = profileModel.enabled
    ? getSupabaseProfileVerificationSql(profileModel)
    : '';

  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"

if [[ -f "\${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\${ROOT_DIR}/.env"
  set +a
fi

NAMESPACE="\${ANKH_NAMESPACE:-${defaultNamespace}}"
AUTH_RUNTIME_MODE="\${AUTH_RUNTIME_MODE:-local}"
SUPABASE_LOCAL_ENABLED="\${SUPABASE_LOCAL_ENABLED:-${supabaseLocalEnabled ? 'true' : 'false'}}"
SUPABASE_SECRET_SYNC_ENABLED="\${SUPABASE_SECRET_SYNC_ENABLED:-true}"
SUPABASE_PROJECT_DIR="\${SUPABASE_PROJECT_DIR:-\${ROOT_DIR}}"
EXPECTED_SUPABASE_PROJECT_ID="${supabaseProjectId ?? ''}"
SUPABASE_PROFILE_ENABLED="${profileModel.enabled ? 'true' : 'false'}"
SUPABASE_PROFILE_RECONCILE_FILE="\${SUPABASE_PROJECT_DIR}/supabase/generated/auth_profiles.sql"
export EXPECTED_SUPABASE_PROJECT_ID

reject_supabase_project_id_override() {
  if [[ -n "\${SUPABASE_PROJECT_ID:-}" ]]; then
    echo "SUPABASE_PROJECT_ID must not be set for generated local Infra scripts."
    echo "Unset SUPABASE_PROJECT_ID and use supabase/config.toml project_id instead."
    return 1
  fi

  unset SUPABASE_PROJECT_ID
}

require_expected_supabase_project_identity() {
  if [[ -z "\${EXPECTED_SUPABASE_PROJECT_ID}" ]]; then
    echo "Cannot run local Supabase infrastructure: expected Supabase project identity is empty."
    echo "Regenerate Infra with appManifest.metadata.slug for Supabase-backed local services."
    return 1
  fi
}

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required but not installed."
  exit 1
fi

if ! kubectl config current-context >/dev/null 2>&1; then
  echo "No active kubectl context is configured."
  echo "Run ./scripts/up.sh to start Minikube and apply manifests."
  exit 1
fi

if ! kubectl cluster-info >/dev/null 2>&1; then
  CONTEXT="$(kubectl config current-context 2>/dev/null || echo "unknown")"
  echo "Cannot reach Kubernetes API server for context '\${CONTEXT}'."
  echo "Run ./scripts/up.sh or verify your kubeconfig context."
  exit 1
fi

if ! kubectl get namespace "\${NAMESPACE}" >/dev/null 2>&1; then
  echo "Namespace '\${NAMESPACE}' was not found in the current cluster."
  echo "Run ./scripts/up.sh to create it and apply resources."
  exit 1
fi

kubectl get all -n "\${NAMESPACE}"

echo
echo "Runtime auth checks:"
echo "- AUTH_RUNTIME_MODE=\${AUTH_RUNTIME_MODE}"
echo "- SUPABASE_SECRET_SYNC_ENABLED=\${SUPABASE_SECRET_SYNC_ENABLED}"

if kubectl -n "\${NAMESPACE}" get configmap app-runtime-auth-env >/dev/null 2>&1; then
  echo "- configmap/app-runtime-auth-env: present"
else
  echo "- configmap/app-runtime-auth-env: missing"
fi

if [[ "\${SUPABASE_SECRET_SYNC_ENABLED}" == "true" ]]; then
  if kubectl -n "\${NAMESPACE}" get secret supabase-auth-secrets >/dev/null 2>&1; then
    echo "- secret/supabase-auth-secrets: present"

    has_secret_key() {
      local key="$1"
      local value
      value="$(kubectl -n "\${NAMESPACE}" get secret supabase-auth-secrets -o "jsonpath={.data.\${key}}" 2>/dev/null || true)"
      [[ -n "\${value}" ]]
    }

    required_secret_keys=(
      SUPABASE_URL
      SUPABASE_ANON_KEY
      SUPABASE_SERVICE_ROLE_KEY
      SUPABASE_JWT_SECRET
      EXPO_PUBLIC_SUPABASE_URL
      EXPO_PUBLIC_SUPABASE_ANON_KEY
    )

    for key in "\${required_secret_keys[@]}"; do
      if has_secret_key "\${key}"; then
        echo "  - \${key}: present"
      else
        echo "  - \${key}: missing"
      fi
    done
  else
    echo "- secret/supabase-auth-secrets: missing"
  fi
else
  echo "- secret/supabase-auth-secrets: skipped (SUPABASE_SECRET_SYNC_ENABLED=false)"
fi

version_ge() {
  local actual="$1"
  local minimum="$2"

  local actual_major actual_minor actual_patch
  local minimum_major minimum_minor minimum_patch
  IFS=. read -r actual_major actual_minor actual_patch <<< "\${actual}"
  IFS=. read -r minimum_major minimum_minor minimum_patch <<< "\${minimum}"

  actual_major="\${actual_major:-0}"
  actual_minor="\${actual_minor:-0}"
  actual_patch="\${actual_patch:-0}"
  minimum_major="\${minimum_major:-0}"
  minimum_minor="\${minimum_minor:-0}"
  minimum_patch="\${minimum_patch:-0}"

  (( actual_major > minimum_major )) && return 0
  (( actual_major < minimum_major )) && return 1
  (( actual_minor > minimum_minor )) && return 0
  (( actual_minor < minimum_minor )) && return 1
  (( actual_patch >= minimum_patch ))
}

require_supabase_cli_capabilities() {
  if ! command -v supabase >/dev/null 2>&1; then
    echo "supabase CLI is required for local schema status checks."
    echo "Install or upgrade: https://supabase.com/docs/guides/local-development/cli/getting-started"
    return 1
  fi

  local version
  version="$(supabase --version | awk '{print $NF}')"
  if ! version_ge "\${version}" "2.106.0"; then
    echo "supabase CLI >= 2.106.0 is required; found \${version}."
    echo "Upgrade: https://supabase.com/docs/guides/local-development/cli/getting-started"
    return 1
  fi

  if ! supabase status --help 2>/dev/null | grep -Fq -- "--workdir"; then
    echo "supabase CLI does not support required global --workdir flag."
    return 1
  fi

  if ! supabase migration up --help 2>/dev/null | grep -Fq -- "--local"; then
    echo "supabase CLI does not support required migration up --local command."
    return 1
  fi

  if ! command -v psql >/dev/null 2>&1; then
    echo "psql is required for local schema status checks."
    return 1
  fi
}

read_env_value() {
  local source="$1"
  local key="$2"
  local line
  line="$(printf '%s\\n' "\${source}" | awk -v key="\${key}" '
    $0 ~ "^(export[[:space:]]+)?" key "=" {print}
  ' | tail -n1)"

  if [[ -z "\${line}" ]]; then
    echo ""
    return
  fi

  line="\${line#export }"
  line="\${line#\${key}=}"
  line="\${line%\\"}"
  line="\${line#\\"}"
  printf '%s' "\${line}"
}

run_supabase_sql() {
  local sql="$1"
  local label="$2"
  local tmp_file
  tmp_file="$(mktemp)"
  printf '%s\\n' "\${sql}" > "\${tmp_file}"

  if psql "\${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -q -f "\${tmp_file}" >/dev/null; then
    rm -f "\${tmp_file}"
    return 0
  fi

  rm -f "\${tmp_file}"
  echo "- \${label}: failed"
  return 1
}

validate_supabase_project_identity() {
  local config_file="\${SUPABASE_PROJECT_DIR}/supabase/config.toml"

  if [[ -z "\${EXPECTED_SUPABASE_PROJECT_ID}" ]]; then
    return 0
  fi

  if [[ ! -f "\${config_file}" ]]; then
    echo "- local Supabase project identity: config missing at \${config_file}"
    return 1
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    echo "- local Supabase project identity: python3 is required to read \${config_file}"
    return 1
  fi

  python3 - "\${config_file}" <<'PY'
import os
import re
import sys


def read_top_level_project_id(config_path):
    key_re = re.compile(r'^\\s*project_id\\s*=\\s*(.*?)\\s*(?:#.*)?$')
    section_re = re.compile(r'^\\s*\\[[^\\]]+\\]\\s*$')

    with open(config_path, 'r', encoding='utf-8') as f:
        for line in f:
            if section_re.match(line):
                return None
            match = key_re.match(line)
            if not match:
                continue
            raw = match.group(1).strip()
            quoted = re.match(r'^["\\']([^"\\']*)["\\']$', raw)
            return quoted.group(1) if quoted else raw

    return None


expected = os.environ['EXPECTED_SUPABASE_PROJECT_ID']
actual = read_top_level_project_id(sys.argv[1])

if actual == expected:
    raise SystemExit(0)

found = 'missing' if actual is None else f'"{actual}"'
print('Supabase project identity mismatch.', file=sys.stderr)
print(f'Expected "{expected}", found {found}.', file=sys.stderr)
print('Destroy the invalid local stack and run Infra Up again.', file=sys.stderr)
raise SystemExit(1)
PY
}

check_immutable_migrations_applied() {
  local migrations_dir="\${SUPABASE_PROJECT_DIR}/supabase/migrations"
  local applied_versions
  applied_versions="$(psql "\${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -Atc "select version from supabase_migrations.schema_migrations" 2>/dev/null || true)"

  if [[ -z "\${applied_versions}" ]]; then
    applied_versions=""
  fi

  if [[ ! -d "\${migrations_dir}" ]]; then
    return 0
  fi

  local file
  local version
  local pending=0
  for file in "\${migrations_dir}"/*.sql; do
    [[ -e "\${file}" ]] || continue
    version="$(basename "\${file}")"
    version="\${version%%_*}"
    if ! printf '%s\\n' "\${applied_versions}" | grep -Fxq "\${version}"; then
      echo "- immutable migrations: pending \${file}"
      pending=1
    fi
  done

  return "\${pending}"
}

if [[ "\${AUTH_RUNTIME_MODE}" == "local" && "\${SUPABASE_LOCAL_ENABLED}" == "true" ]]; then
  echo
  echo "Local Supabase database checks:"
  status_failed=0

  if ! require_expected_supabase_project_identity; then
    status_failed=1
  elif ! reject_supabase_project_id_override; then
    status_failed=1
  elif require_supabase_cli_capabilities; then
    if ! validate_supabase_project_identity; then
      status_failed=1
    elif supabase --workdir "\${SUPABASE_PROJECT_DIR}" status >/dev/null 2>&1; then
      STATUS_ENV="$(supabase --workdir "\${SUPABASE_PROJECT_DIR}" status -o env)"
      SUPABASE_DB_URL="$(read_env_value "\${STATUS_ENV}" DB_URL)"
      if [[ -z "\${SUPABASE_DB_URL}" ]]; then
        echo "- immutable migrations: status unavailable (DB_URL missing from supabase status)"
        status_failed=1
      elif check_immutable_migrations_applied; then
        echo "- immutable migrations: applied"
      else
        echo "- immutable migrations: pending"
        status_failed=1
      fi

      if [[ "\${SUPABASE_PROFILE_ENABLED}" == "true" ]]; then
        if [[ -f "\${SUPABASE_PROFILE_RECONCILE_FILE}" ]]; then
          PROFILE_STATUS_SQL=$(cat <<'SQL'
${profileStatusSql}
SQL
)
          PROFILE_VERIFY_SQL=$(cat <<'SQL'
${profileVerificationSql}
SQL
)

          if run_supabase_sql "\${PROFILE_STATUS_SQL}" "profile reconciliation"; then
            echo "- profile reconciliation: applied, checksum matches"
          else
            echo "- profile reconciliation: pending or stale"
            status_failed=1
          fi

          if run_supabase_sql "\${PROFILE_VERIFY_SQL}" "profile schema"; then
            echo "- profile schema: verified"
          else
            echo "- profile schema: drift detected"
            status_failed=1
          fi
        else
          echo "- profile reconciliation: generated file missing at \${SUPABASE_PROFILE_RECONCILE_FILE}"
          echo "- profile schema: not verified"
          status_failed=1
        fi
      else
        PROFILE_DISABLED_SQL=$(cat <<'SQL'
${getSupabaseProfileDisabledGuardSql()}
SQL
)
        if run_supabase_sql "\${PROFILE_DISABLED_SQL}" "profile disabled-state"; then
          echo "- profile reconciliation: skipped (no profile table configured)"
          echo "- profile schema: skipped (no profile table configured)"
        else
          echo "- profile reconciliation: stale generated state exists for removed profile table"
          echo "- profile schema: not verified"
          status_failed=1
        fi
      fi
    else
      echo "- local Supabase stack: not running or not reachable from \${SUPABASE_PROJECT_DIR}"
      status_failed=1
    fi
  else
    status_failed=1
  fi

  if [[ "\${status_failed}" -ne 0 ]]; then
    exit "\${status_failed}"
  fi
fi
`;
}

function getSupabaseLocalEnvScript(args: {
  supabaseProjectId: string | null;
  supabaseLocalPorts: SupabaseLocalPorts;
  profileModel: ResolvedProfileModel;
}): string {
  const { supabaseProjectId, supabaseLocalPorts, profileModel } = args;
  const profileStatusSql = profileModel.enabled ? getSupabaseProfileChecksumSql(profileModel) : '';
  const profileVerificationSql = profileModel.enabled
    ? getSupabaseProfileVerificationSql(profileModel)
    : '';

  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="\${ROOT_DIR}/.env"
ENV_EXAMPLE_FILE="\${ROOT_DIR}/.env.example"

if [[ -f "\${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\${ENV_FILE}"
  set +a
fi

APP_SOURCE_DIR="\${APP_SOURCE_DIR:-$(cd "\${ROOT_DIR}/../.." && pwd)}"
SUPABASE_PROJECT_DIR="\${SUPABASE_PROJECT_DIR:-\${ROOT_DIR}}"
EXPECTED_SUPABASE_PROJECT_ID="${supabaseProjectId ?? ''}"
APP_SUPABASE_ENV_FILE="\${APP_SUPABASE_ENV_FILE:-\${APP_SOURCE_DIR}/.env.local}"
SUPABASE_PROFILE_ENABLED="${profileModel.enabled ? 'true' : 'false'}"
SUPABASE_PROFILE_RECONCILE_FILE="\${SUPABASE_PROJECT_DIR}/supabase/generated/auth_profiles.sql"
export EXPECTED_SUPABASE_PROJECT_ID

reject_supabase_project_id_override() {
  if [[ -n "\${SUPABASE_PROJECT_ID:-}" ]]; then
    echo "SUPABASE_PROJECT_ID must not be set for generated local Infra scripts."
    echo "Unset SUPABASE_PROJECT_ID and use supabase/config.toml project_id instead."
    exit 1
  fi

  unset SUPABASE_PROJECT_ID
}

require_expected_supabase_project_identity() {
  if [[ -z "\${EXPECTED_SUPABASE_PROJECT_ID}" ]]; then
    echo "Cannot run local Supabase infrastructure: expected Supabase project identity is empty."
    echo "Regenerate Infra with appManifest.metadata.slug for Supabase-backed local services."
    exit 1
  fi
}

SUPABASE_LOCAL_PORT_BASE="\${SUPABASE_LOCAL_PORT_BASE:-${supabaseLocalPorts.base}}"
SUPABASE_LOCAL_SHADOW_PORT="\${SUPABASE_LOCAL_SHADOW_PORT:-\${SUPABASE_LOCAL_PORT_BASE}}"
SUPABASE_LOCAL_API_PORT="\${SUPABASE_LOCAL_API_PORT:-$((SUPABASE_LOCAL_PORT_BASE + 1))}"
SUPABASE_LOCAL_DB_PORT="\${SUPABASE_LOCAL_DB_PORT:-$((SUPABASE_LOCAL_PORT_BASE + 2))}"
SUPABASE_LOCAL_STUDIO_PORT="\${SUPABASE_LOCAL_STUDIO_PORT:-$((SUPABASE_LOCAL_PORT_BASE + 3))}"
SUPABASE_LOCAL_INBUCKET_PORT="\${SUPABASE_LOCAL_INBUCKET_PORT:-$((SUPABASE_LOCAL_PORT_BASE + 4))}"
SUPABASE_LOCAL_ANALYTICS_PORT="\${SUPABASE_LOCAL_ANALYTICS_PORT:-$((SUPABASE_LOCAL_PORT_BASE + 5))}"
export SUPABASE_LOCAL_PORT_BASE
export SUPABASE_LOCAL_SHADOW_PORT
export SUPABASE_LOCAL_API_PORT
export SUPABASE_LOCAL_DB_PORT
export SUPABASE_LOCAL_STUDIO_PORT
export SUPABASE_LOCAL_INBUCKET_PORT
export SUPABASE_LOCAL_ANALYTICS_PORT
version_ge() {
  local actual="$1"
  local minimum="$2"

  local actual_major actual_minor actual_patch
  local minimum_major minimum_minor minimum_patch
  IFS=. read -r actual_major actual_minor actual_patch <<< "\${actual}"
  IFS=. read -r minimum_major minimum_minor minimum_patch <<< "\${minimum}"

  actual_major="\${actual_major:-0}"
  actual_minor="\${actual_minor:-0}"
  actual_patch="\${actual_patch:-0}"
  minimum_major="\${minimum_major:-0}"
  minimum_minor="\${minimum_minor:-0}"
  minimum_patch="\${minimum_patch:-0}"

  (( actual_major > minimum_major )) && return 0
  (( actual_major < minimum_major )) && return 1
  (( actual_minor > minimum_minor )) && return 0
  (( actual_minor < minimum_minor )) && return 1
  (( actual_patch >= minimum_patch ))
}

require_supabase_cli_capabilities() {
  if ! command -v supabase >/dev/null 2>&1; then
    echo "supabase CLI is required but not installed."
    echo "Install or upgrade: https://supabase.com/docs/guides/local-development/cli/getting-started"
    exit 1
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required to reconcile supabase/config.toml before local Supabase startup."
    exit 1
  fi

  local version
  version="$(supabase --version | awk '{print $NF}')"
  if ! version_ge "\${version}" "2.106.0"; then
    echo "supabase CLI >= 2.106.0 is required; found \${version}."
    echo "Upgrade: https://supabase.com/docs/guides/local-development/cli/getting-started"
    exit 1
  fi

  if ! supabase status --help 2>/dev/null | grep -Fq -- "--workdir"; then
    echo "supabase CLI does not support required global --workdir flag."
    echo "Upgrade: https://supabase.com/docs/guides/local-development/cli/getting-started"
    exit 1
  fi

  if ! supabase migration up --help 2>/dev/null | grep -Fq -- "--local"; then
    echo "supabase CLI does not support required migration up --local command."
    echo "Upgrade: https://supabase.com/docs/guides/local-development/cli/getting-started"
    exit 1
  fi

  if ! command -v psql >/dev/null 2>&1; then
    echo "psql is required but not installed."
    exit 1
  fi
}

format_command() {
  printf '%q ' "$@"
}

run_checked_command() {
  local label="$1"
  local sql_file="$2"
  shift 2
  local status
  set +e
  "$@"
  status=$?
  set -e

  if [[ "\${status}" -ne 0 ]]; then
    echo "\${label} failed."
    if [[ -n "\${sql_file}" ]]; then
      echo "SQL file: \${sql_file}"
    fi
    echo "Supabase project workdir: \${SUPABASE_PROJECT_DIR}"
    echo "Command: $(format_command "$@")"
    echo "Exit status: \${status}"
    exit "\${status}"
  fi
}

run_checked_sql_file() {
  local label="$1"
  local sql_file="$2"
  run_checked_command \
    "\${label}" \
    "\${sql_file}" \
    psql "\${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -q -f "\${sql_file}"
}

require_expected_supabase_project_identity
reject_supabase_project_id_override
require_supabase_cli_capabilities

if [[ ! -d "\${SUPABASE_PROJECT_DIR}" ]]; then
  echo "Supabase project directory does not exist: \${SUPABASE_PROJECT_DIR}"
  exit 1
fi

configure_supabase_local_ports() {
  local config_file="\${SUPABASE_PROJECT_DIR}/supabase/config.toml"

  python3 - "\${config_file}" <<'PY'
import os
import re
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class Patch:
    section: str
    key: str
    value: str


def _env_required(name):
    value = os.environ.get(name)
    if value is None or value == "":
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def _is_section_header(line):
    return re.match(r"^\\s*\\[[^\\]]+\\]\\s*$", line) is not None


def _section_name(line):
    match = re.match(r"^\\s*\\[([^\\]]+)\\]\\s*$", line)
    return match.group(1) if match else None


def _patch_section(lines, section, key, value):
    current_section = None
    section_start = None

    for i, line in enumerate(lines):
        if _is_section_header(line):
            current_section = _section_name(line)
            if current_section == section and section_start is None:
                section_start = i

    if section_start is None:
        if lines and not lines[-1].endswith("\\n"):
            lines[-1] = lines[-1] + "\\n"
        if lines and lines[-1].strip() != "":
            lines.append("\\n")
        lines.append(f"[{section}]\\n")
        lines.append(f"{key} = {value}\\n")
        return lines

    section_end = len(lines)
    for j in range(section_start + 1, len(lines)):
        if _is_section_header(lines[j]):
            section_end = j
            break

    key_re = re.compile(rf"^(\\s*){re.escape(key)}\\s*=\\s*(.*?)(\\s*(#.*)?)?$")
    for k in range(section_start + 1, section_end):
        match = key_re.match(lines[k])
        if match:
            indent = match.group(1) or ""
            trailing = match.group(3) or ""
            suffix = trailing.rstrip("\\n")
            lines[k] = f"{indent}{key} = {value}{suffix}\\n"
            return lines

    insert_at = section_end
    while insert_at > section_start + 1 and lines[insert_at - 1].strip() == "":
        insert_at -= 1
    lines.insert(insert_at, f"{key} = {value}\\n")
    return lines


def main():
    if len(sys.argv) != 2:
        raise RuntimeError("Usage: patch_config.py <supabase/config.toml>")

    config_path = sys.argv[1]
    with open(config_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    patches = [
        Patch("api", "port", _env_required("SUPABASE_LOCAL_API_PORT")),
        Patch("db", "port", _env_required("SUPABASE_LOCAL_DB_PORT")),
        Patch("db", "shadow_port", _env_required("SUPABASE_LOCAL_SHADOW_PORT")),
        Patch("studio", "port", _env_required("SUPABASE_LOCAL_STUDIO_PORT")),
        Patch("inbucket", "port", _env_required("SUPABASE_LOCAL_INBUCKET_PORT")),
        Patch("analytics", "port", _env_required("SUPABASE_LOCAL_ANALYTICS_PORT")),
    ]

    for p in patches:
        lines = _patch_section(lines, p.section, p.key, p.value)

    with open(config_path, "w", encoding="utf-8") as f:
        f.writelines(lines)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
PY
}

write_supabase_project_identity_for_new_config() {
  local config_file="\${SUPABASE_PROJECT_DIR}/supabase/config.toml"

  require_expected_supabase_project_identity

  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required to write Supabase project_id in \${config_file}."
    exit 1
  fi

  python3 - "\${config_file}" <<'PY'
import os
import re
import sys


def write_top_level_project_id(config_path, expected):
    key_re = re.compile(r'^(\\s*)project_id\\s*=\\s*(.*?)(\\s*(#.*)?)?$')
    section_re = re.compile(r'^\\s*\\[[^\\]]+\\]\\s*$')

    with open(config_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    section_start = len(lines)
    for i, line in enumerate(lines):
        if section_re.match(line):
            section_start = i
            break

    for i in range(section_start):
        match = key_re.match(lines[i])
        if not match:
            continue
        indent = match.group(1) or ''
        trailing = (match.group(3) or '').rstrip('\\n')
        lines[i] = f'{indent}project_id = "{expected}"{trailing}\\n'
        break
    else:
        insert_at = section_start
        lines.insert(insert_at, f'project_id = "{expected}"\\n')

    with open(config_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)


write_top_level_project_id(sys.argv[1], os.environ['EXPECTED_SUPABASE_PROJECT_ID'])
PY
}

validate_supabase_project_identity() {
  local config_file="\${SUPABASE_PROJECT_DIR}/supabase/config.toml"

  require_expected_supabase_project_identity

  if [[ ! -f "\${config_file}" ]]; then
    echo "Supabase project identity mismatch."
    printf 'Expected "%s", found missing.\n' "\${EXPECTED_SUPABASE_PROJECT_ID}"
    echo "The existing local Supabase project belongs to a different identity."
    echo "Destroy the invalid local stack and its project-owned resources, then run Infra Up again."
    exit 1
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required to read Supabase project_id in \${config_file}."
    exit 1
  fi

  python3 - "\${config_file}" <<'PY'
import os
import re
import sys


def read_top_level_project_id(config_path):
    key_re = re.compile(r'^\\s*project_id\\s*=\\s*(.*?)\\s*(?:#.*)?$')
    section_re = re.compile(r'^\\s*\\[[^\\]]+\\]\\s*$')

    with open(config_path, 'r', encoding='utf-8') as f:
        for line in f:
            if section_re.match(line):
                return None
            match = key_re.match(line)
            if not match:
                continue
            raw = match.group(1).strip()
            quoted = re.match(r'^["\\']([^"\\']*)["\\']$', raw)
            return quoted.group(1) if quoted else raw

    return None


expected = os.environ['EXPECTED_SUPABASE_PROJECT_ID']
actual = read_top_level_project_id(sys.argv[1])

if actual == expected:
    raise SystemExit(0)

found = 'missing' if actual is None else f'"{actual}"'
print('Supabase project identity mismatch.', file=sys.stderr)
print(f'Expected "{expected}", found {found}.', file=sys.stderr)
print('The existing local Supabase project belongs to a different identity.', file=sys.stderr)
print('Destroy the invalid local stack and its project-owned resources, then run Infra Up again.', file=sys.stderr)
raise SystemExit(1)
PY
}

assert_supabase_local_ports_available() {
  local project_label="\${EXPECTED_SUPABASE_PROJECT_ID}"

  ANKH_PROJECT_LABEL="\${project_label}" python3 - <<'PY'
import os
import socket
import sys


PORT_KEYS = [
    "SUPABASE_LOCAL_SHADOW_PORT",
    "SUPABASE_LOCAL_API_PORT",
    "SUPABASE_LOCAL_DB_PORT",
    "SUPABASE_LOCAL_STUDIO_PORT",
    "SUPABASE_LOCAL_INBUCKET_PORT",
    "SUPABASE_LOCAL_ANALYTICS_PORT",
]


def read_port(key):
    value = os.environ.get(key, "")
    try:
        port = int(value)
    except ValueError:
        raise RuntimeError(f"{key} must be an integer, got {value!r}") from None

    if port < 1 or port > 65535:
        raise RuntimeError(f"{key} must be between 1 and 65535, got {port}")

    return port


def can_bind(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("0.0.0.0", port))
        except OSError:
            return False
    return True


def main():
    project_label = os.environ.get("ANKH_PROJECT_LABEL", "unknown")
    ports = [(key, read_port(key)) for key in PORT_KEYS]

    seen = {}
    duplicates = []
    for key, port in ports:
      existing = seen.get(port)
      if existing is not None:
        duplicates.append((key, existing, port))
      else:
        seen[port] = key

    blocked = [(key, port) for key, port in ports if not can_bind(port)]

    if not duplicates and not blocked:
        return 0

    print(f"Supabase local port preflight failed for project '{project_label}'.", file=sys.stderr)

    for key, existing, port in duplicates:
        print(f"- {key} duplicates {existing} on port {port}.", file=sys.stderr)

    for key, port in blocked:
        print(f"- {key}={port} is already in use on this host.", file=sys.stderr)

    print("Override SUPABASE_LOCAL_PORT_BASE or the specific SUPABASE_LOCAL_*_PORT values in infra/minikube/.env and retry.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
PY
}

if [[ ! -f "\${SUPABASE_PROJECT_DIR}/supabase/config.toml" ]]; then
  echo "No supabase/config.toml found in \${SUPABASE_PROJECT_DIR}. Initializing Supabase project..."
  supabase --workdir "\${SUPABASE_PROJECT_DIR}" init --yes >/dev/null
  write_supabase_project_identity_for_new_config
fi

validate_supabase_project_identity
configure_supabase_local_ports

STATUS_ENV="$(
  supabase --workdir "\${SUPABASE_PROJECT_DIR}" status -o env 2>/dev/null || true
)"

read_env_value() {
  local key="$1"
  local line
  line="$(printf '%s\\n' "\${STATUS_ENV}" | awk -v key="\${key}" '
    $0 ~ "^(export[[:space:]]+)?" key "=" {print}
  ' | tail -n1)"

  if [[ -z "\${line}" ]]; then
    echo ""
    return
  fi

  line="\${line#export }"
  line="\${line#\${key}=}"
  line="\${line%\\"}"
  line="\${line#\\"}"
  printf '%s' "\${line}"
}

check_immutable_migrations_applied() {
  local migrations_dir="\${SUPABASE_PROJECT_DIR}/supabase/migrations"
  local applied_versions
  applied_versions="$(psql "\${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -Atc "select version from supabase_migrations.schema_migrations" 2>/dev/null || true)"

  if [[ -z "\${applied_versions}" ]]; then
    applied_versions=""
  fi

  if [[ ! -d "\${migrations_dir}" ]]; then
    return 0
  fi

  local file
  local version
  local pending=0
  for file in "\${migrations_dir}"/*.sql; do
    [[ -e "\${file}" ]] || continue
    version="$(basename "\${file}")"
    version="\${version%%_*}"
    if ! printf '%s\\n' "\${applied_versions}" | grep -Fxq "\${version}"; then
      echo "Pending immutable Supabase migration: \${file}"
      pending=1
    fi
  done

  return "\${pending}"
}

start_supabase_local_stack() {
  if supabase --workdir "\${SUPABASE_PROJECT_DIR}" start >/dev/null; then
    return 0
  fi

  echo "Supabase local start failed. Stopping stale local stack and retrying once..."
  supabase --workdir "\${SUPABASE_PROJECT_DIR}" stop --no-backup >/dev/null 2>&1 || true

  if supabase --workdir "\${SUPABASE_PROJECT_DIR}" start >/dev/null; then
    return 0
  fi

  echo "Supabase local start failed after retry."
  return 1
}

if [[ -z "\${STATUS_ENV}" ]]; then
  validate_supabase_project_identity
  assert_supabase_local_ports_available
  echo "Supabase local stack not detected. Starting with 'supabase start'..."
  start_supabase_local_stack
  STATUS_ENV="$(supabase --workdir "\${SUPABASE_PROJECT_DIR}" status -o env)"
fi

SUPABASE_DB_URL="$(read_env_value DB_URL)"
if [[ -z "\${SUPABASE_DB_URL}" ]]; then
  echo "Unable to read DB_URL from 'supabase status -o env'."
  exit 1
fi

echo "Applying pending immutable Supabase migrations..."
validate_supabase_project_identity
run_checked_command \
  "Immutable Supabase migration application" \
  "" \
  supabase --workdir "\${SUPABASE_PROJECT_DIR}" migration up --local

if ! check_immutable_migrations_applied; then
  echo "Immutable Supabase migration application did not apply every local migration."
  exit 1
fi

if [[ "\${SUPABASE_PROFILE_ENABLED}" == "true" ]]; then
  if [[ ! -f "\${SUPABASE_PROFILE_RECONCILE_FILE}" ]]; then
    echo "Generated profile reconciliation file is missing: \${SUPABASE_PROFILE_RECONCILE_FILE}"
    exit 1
  fi

  echo "Applying generated profile reconciliation..."
  run_checked_sql_file \
    "Generated profile reconciliation" \
    "\${SUPABASE_PROFILE_RECONCILE_FILE}"

  PROFILE_STATUS_SQL=$(cat <<'SQL'
${profileStatusSql}
SQL
)
  PROFILE_VERIFY_SQL=$(cat <<'SQL'
${profileVerificationSql}
SQL
)

  PROFILE_STATUS_FILE="$(mktemp)"
  PROFILE_VERIFY_FILE="$(mktemp)"
  printf '%s\\n' "\${PROFILE_STATUS_SQL}" > "\${PROFILE_STATUS_FILE}"
  printf '%s\\n' "\${PROFILE_VERIFY_SQL}" > "\${PROFILE_VERIFY_FILE}"

  run_checked_sql_file \
    "Generated profile reconciliation checksum verification" \
    "\${PROFILE_STATUS_FILE}"
  run_checked_sql_file \
    "Generated profile schema verification" \
    "\${PROFILE_VERIFY_FILE}"

  rm -f "\${PROFILE_STATUS_FILE}" "\${PROFILE_VERIFY_FILE}"
  echo "Generated profile reconciliation applied and schema verified."
else
  PROFILE_DISABLED_FILE="$(mktemp)"
  cat > "\${PROFILE_DISABLED_FILE}" <<'SQL'
${getSupabaseProfileDisabledGuardSql()}
SQL
  run_checked_sql_file \
    "Generated profile disabled-state verification" \
    "\${PROFILE_DISABLED_FILE}"
  rm -f "\${PROFILE_DISABLED_FILE}"
fi

STATUS_ENV="$(supabase --workdir "\${SUPABASE_PROJECT_DIR}" status -o env)"

API_URL="$(read_env_value API_URL)"
ANON_KEY="$(read_env_value ANON_KEY)"
SERVICE_ROLE_KEY="$(read_env_value SERVICE_ROLE_KEY)"
JWT_SECRET="$(read_env_value JWT_SECRET)"

if [[ -z "\${API_URL}" || -z "\${ANON_KEY}" || -z "\${SERVICE_ROLE_KEY}" || -z "\${JWT_SECRET}" ]]; then
  echo "Unable to read required Supabase values from 'supabase status -o env'."
  echo "Expected API_URL, ANON_KEY, SERVICE_ROLE_KEY, JWT_SECRET."
  exit 1
fi

upsert_env() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp_file
  tmp_file="$(mktemp)"

  awk -v key="\${key}" -v value="\${value}" '
    BEGIN { replaced = 0 }
    index($0, key "=") == 1 {
      print key "=" value
      replaced = 1
      next
    }
    { print }
    END {
      if (replaced == 0) {
        print key "=" value
      }
    }
  ' "\${file}" > "\${tmp_file}"

  mv "\${tmp_file}" "\${file}"
}

if [[ ! -f "\${ENV_FILE}" ]]; then
  cp "\${ENV_EXAMPLE_FILE}" "\${ENV_FILE}"
fi

if [[ ! -f "\${APP_SUPABASE_ENV_FILE}" ]]; then
  touch "\${APP_SUPABASE_ENV_FILE}"
fi

upsert_env "\${ENV_FILE}" "SUPABASE_SECRET_SYNC_ENABLED" "true"
upsert_env "\${ENV_FILE}" "SUPABASE_URL" "\${API_URL}"
upsert_env "\${ENV_FILE}" "SUPABASE_ANON_KEY" "\${ANON_KEY}"
upsert_env "\${ENV_FILE}" "SUPABASE_SERVICE_ROLE_KEY" "\${SERVICE_ROLE_KEY}"
upsert_env "\${ENV_FILE}" "SUPABASE_JWT_SECRET" "\${JWT_SECRET}"
upsert_env "\${ENV_FILE}" "EXPO_PUBLIC_SUPABASE_URL" "\${API_URL}"
upsert_env "\${ENV_FILE}" "EXPO_PUBLIC_SUPABASE_ANON_KEY" "\${ANON_KEY}"
upsert_env "\${ENV_FILE}" "SUPABASE_PROJECT_DIR" "\${SUPABASE_PROJECT_DIR}"
upsert_env "\${ENV_FILE}" "SUPABASE_LOCAL_PORT_BASE" "\${SUPABASE_LOCAL_PORT_BASE}"
upsert_env "\${ENV_FILE}" "SUPABASE_LOCAL_SHADOW_PORT" "\${SUPABASE_LOCAL_SHADOW_PORT}"
upsert_env "\${ENV_FILE}" "SUPABASE_LOCAL_API_PORT" "\${SUPABASE_LOCAL_API_PORT}"
upsert_env "\${ENV_FILE}" "SUPABASE_LOCAL_DB_PORT" "\${SUPABASE_LOCAL_DB_PORT}"
upsert_env "\${ENV_FILE}" "SUPABASE_LOCAL_STUDIO_PORT" "\${SUPABASE_LOCAL_STUDIO_PORT}"
upsert_env "\${ENV_FILE}" "SUPABASE_LOCAL_INBUCKET_PORT" "\${SUPABASE_LOCAL_INBUCKET_PORT}"
upsert_env "\${ENV_FILE}" "SUPABASE_LOCAL_ANALYTICS_PORT" "\${SUPABASE_LOCAL_ANALYTICS_PORT}"

upsert_env "\${APP_SUPABASE_ENV_FILE}" "EXPO_PUBLIC_SUPABASE_URL" "\${API_URL}"
upsert_env "\${APP_SUPABASE_ENV_FILE}" "EXPO_PUBLIC_SUPABASE_ANON_KEY" "\${ANON_KEY}"
upsert_env "\${APP_SUPABASE_ENV_FILE}" "SUPABASE_URL" "\${API_URL}"
upsert_env "\${APP_SUPABASE_ENV_FILE}" "SUPABASE_ANON_KEY" "\${ANON_KEY}"

echo "Updated \${ENV_FILE} with local Supabase credentials from \${SUPABASE_PROJECT_DIR}."
echo "Updated \${APP_SUPABASE_ENV_FILE} with Expo Supabase credentials for local app runs."
echo "If Expo is already running, restart it to pick up updated EXPO_PUBLIC_* variables."
echo "Next: run ./scripts/up.sh to sync Kubernetes secrets and apply infrastructure."
`;
}

function getDefaultAppImage(namespace: string): string {
  return `ankh/${namespace}:dev`;
}

function resolveSupabaseLocalPorts(namespace: string): SupabaseLocalPorts {
  const base =
    SUPABASE_LOCAL_PORT_BASE +
    resolveSupabaseLocalPortBucket(namespace) * SUPABASE_LOCAL_PORT_BUCKET_SIZE;

  return {
    base,
    shadow: base,
    api: base + 1,
    db: base + 2,
    studio: base + 3,
    inbucket: base + 4,
    analytics: base + 5,
  };
}

function resolveSupabaseLocalPortBucket(namespace: string): number {
  const rawBucket = hashProjectId(namespace) - hashProjectId(SUPABASE_LOCAL_PORT_REFERENCE_PROJECT);
  return (rawBucket + SUPABASE_LOCAL_PORT_BUCKET_COUNT) % SUPABASE_LOCAL_PORT_BUCKET_COUNT;
}

function hashProjectId(value: string): number {
  const source = value.trim().length > 0 ? value.trim() : 'app';
  let hash = 0;

  for (const char of source) {
    hash = (hash * 31 + char.charCodeAt(0)) % SUPABASE_LOCAL_PORT_BUCKET_COUNT;
  }

  return hash;
}

function getSqlTextArray(values: readonly string[]): string {
  return `array[${values.map((value) => `'${escapeSqlLiteral(value)}'`).join(', ')}]::text[]`;
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}
