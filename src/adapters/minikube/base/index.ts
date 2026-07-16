import type { GeneratedInfrastructureFile } from '../../../types';
import type { InfraManifestInput } from '../../../types';
import type { ResolvedProfileModel } from '../auth/supabase/profile';
import { resolveSupabaseProfileModel } from '../auth/supabase/profile';

export const APP_NAMESPACE = 'app';
const SUPABASE_NAMESPACE = 'supabase';

interface SupabaseHostPorts {
  app: number;
  gateway: number;
  studio: number;
  db: number;
}

interface AppInfraStorageMetadata {
  provider: 'supabase';
  bucketsCsv: string;
  defaultBucket: string;
}

interface SupabaseImagePins {
  postgres: string;
  auth: string;
  rest: string;
  realtime: string;
  storage: string;
  imgproxy: string;
  meta: string;
  gateway: string;
  studio: string;
}

const SUPABASE_IMAGES: SupabaseImagePins = {
  postgres: 'supabase/postgres:17.4.1.054',
  auth: 'supabase/gotrue:v2.189.0',
  rest: 'postgrest/postgrest:v14.12',
  realtime: 'supabase/realtime:v2.102.3',
  storage: 'supabase/storage-api:v1.60.4',
  imgproxy: 'darthsim/imgproxy:v3.30.1',
  meta: 'supabase/postgres-meta:v0.96.6',
  gateway: 'kong/kong:3.9.1',
  studio: 'supabase/studio:2026.07.07-sha-a6a04f2',
};

const PORT_BASE = 18080;
const PORT_BUCKET_SIZE = 20;
const PORT_BUCKET_COUNT = 1000;
const PORT_REFERENCE_SLUG = 'my-app';

export function generateMinikubeBaseArtifacts(args: {
  manifest: InfraManifestInput;
  appSlug: string;
  extraResources: string[];
  extraEnvEntries: string[];
}): GeneratedInfrastructureFile[] {
  const { manifest, appSlug, extraResources, extraEnvEntries } = args;

  const root = 'infra/minikube';
  const k8sRoot = `${root}/k8s`;
  const scriptsRoot = `${root}/scripts`;
  const appImageRoot = `${root}/app-image`;
  const defaultAppImage = getDefaultAppImage(appSlug);
  const supabaseHostPorts = resolveSupabaseHostPorts(appSlug);

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

  const supabaseResources = supabaseLocalEnabled ? getSupabaseResourceFiles(k8sRoot) : [];
  const namespaceResources = supabaseLocalEnabled
    ? ['namespaces/app.yaml', 'namespaces/supabase.yaml']
    : ['namespaces/app.yaml'];

  return [
    {
      path: `${root}/README.md`,
      content: getReadmeMarkdown({
        appSlug,
        defaultAppImage,
        monitoringEnabled,
        authProvider,
        authzEngine,
        extraResources,
        supabaseHostPorts,
        supabaseLocalEnabled,
        profileModel,
      }),
    },
    {
      path: `${root}/.env.example`,
      content: getEnvExample({
        appSlug,
        domain,
        extraEnvEntries,
        defaultAppImage,
        supabaseHostPorts,
        supabaseLocalEnabled,
      }),
    },
    {
      path: `${k8sRoot}/namespaces/app.yaml`,
      content: getNamespaceManifest(APP_NAMESPACE),
    },
    ...(supabaseLocalEnabled
      ? [
          {
            path: `${k8sRoot}/namespaces/supabase.yaml`,
            content: getNamespaceManifest(SUPABASE_NAMESPACE),
          },
        ]
      : []),
    {
      path: `${k8sRoot}/app.configmap.yaml`,
      content: getAppConfigMap({
        appSlug,
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
      content: getAppDeploymentManifest(defaultAppImage),
    },
    {
      path: `${k8sRoot}/app/service.yaml`,
      content: getAppServiceManifest(),
    },
    ...supabaseResources,
    {
      path: `${k8sRoot}/kustomization.yaml`,
      content: getKustomizationManifest({
        namespaceResources,
        supabaseEnabled: supabaseLocalEnabled,
        extraResources,
      }),
    },
    {
      path: `${scriptsRoot}/up.sh`,
      content: getUpScript({
        appSlug,
        defaultAppImage,
        supabaseLocalEnabled,
        profileModel,
      }),
      executable: true,
    },
    {
      path: `${scriptsRoot}/build-app-image.sh`,
      content: getBuildAppImageScript({ appSlug, defaultAppImage }),
      executable: true,
    },
    {
      path: `${scriptsRoot}/port-forward.sh`,
      content: getPortForwardScript({
        appSlug,
        supabaseLocalEnabled,
        supabaseHostPorts,
      }),
      executable: true,
    },
    {
      path: `${scriptsRoot}/down.sh`,
      content: getDownScript(appSlug),
      executable: true,
    },
    {
      path: `${scriptsRoot}/reset.sh`,
      content: getResetScript(appSlug),
      executable: true,
    },
    {
      path: `${scriptsRoot}/destroy.sh`,
      content: getDestroyScript(appSlug),
      executable: true,
    },
    {
      path: `${scriptsRoot}/status.sh`,
      content: getStatusScript({
        appSlug,
        supabaseLocalEnabled,
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
  appSlug: string;
  defaultAppImage: string;
  monitoringEnabled: boolean;
  authProvider: string;
  authzEngine: string;
  extraResources: string[];
  supabaseHostPorts: SupabaseHostPorts;
  supabaseLocalEnabled: boolean;
  profileModel: ResolvedProfileModel;
}): string {
  const {
    appSlug,
    defaultAppImage,
    monitoringEnabled,
    authProvider,
    authzEngine,
    extraResources,
    supabaseHostPorts,
    supabaseLocalEnabled,
    profileModel,
  } = args;
  const resourceLines = [
    'namespaces/app.yaml',
    ...(supabaseLocalEnabled ? ['namespaces/supabase.yaml'] : []),
    'app.configmap.yaml',
    'app/deployment.yaml',
    'app/service.yaml',
    ...(supabaseLocalEnabled
      ? [
          'supabase/secrets.yaml',
          'supabase/postgres.pvc.yaml',
          'supabase/postgres.yaml',
          'supabase/auth.yaml',
          'supabase/rest.yaml',
          'supabase/realtime.yaml',
          'supabase/storage.yaml',
          'supabase/imgproxy.yaml',
          'supabase/meta.yaml',
          'supabase/gateway.configmap.yaml',
          'supabase/gateway.yaml',
          'supabase/studio.yaml',
        ]
      : []),
    ...extraResources,
  ]
    .map((resource) => `- \`k8s/${resource}\``)
    .join('\n');

  return `# Minikube Infra

This directory is generated from \`ankh.config.json\` (infra manifest).

## Ownership Model

- App slug / Minikube profile: \`${appSlug}\`
- App runtime namespace: \`${APP_NAMESPACE}\`
- Supabase namespace: \`${supabaseLocalEnabled ? SUPABASE_NAMESPACE : 'unused'}\`
- Default app image: \`${defaultAppImage}\`

One app owns one complete Minikube profile. Provider-owned workloads are separated by
Kubernetes namespace inside that profile. There is no shared \`minikube\` profile and no
host-level Supabase Compose runtime.

## Quick Start

1. Copy env template:
   \`\`\`bash
   cp .env.example .env
   \`\`\`
2. Fill required Supabase secrets when Supabase is enabled.
3. Start infra:
   \`\`\`bash
   ./scripts/up.sh
   \`\`\`
4. Check status:
   \`\`\`bash
   ./scripts/status.sh
   \`\`\`
5. Stop the app-owned cluster without deleting data:
   \`\`\`bash
   ./scripts/down.sh
   \`\`\`

## Lifecycle Semantics

- \`up.sh\`: starts \`minikube -p ${appSlug}\`, deploys provider namespaces, runs migrations with \`supabase migration up --db-url "$SUPABASE_DB_URL"\`, starts slug-owned port-forwards, and deploys the app runtime.
- \`down.sh\`: stops slug-owned port-forwards, then stops \`minikube -p ${appSlug}\`. Persistent data remains in the profile.
- \`reset.sh\`: requires \`ANKH_RESET_CONFIRM=${appSlug}\`; deletes and recreates the \`app\` and \`supabase\` namespaces and their PVC-backed data inside the existing profile. It does not delete the Minikube profile.
- \`destroy.sh\`: deletes only \`minikube -p ${appSlug}\`.

## Generated Resources

${resourceLines}

## Supabase Runtime

Supabase runtime ownership is Kubernetes. Migration authoring/history remains Supabase
migration files. Migration execution targets the Kubernetes Postgres endpoint through
\`supabase migration up --db-url "$SUPABASE_DB_URL"\`.

Supabase manifests are generated from the current official Supabase self-hosting Docker
topology, service documentation, environment-variable contracts, and pinned official images.
Kubernetes/Helm is treated as community-driven upstream guidance, not an official
distribution copied by this generator.

Pinned images:

- Postgres: \`${SUPABASE_IMAGES.postgres}\`
- Auth: \`${SUPABASE_IMAGES.auth}\`
- PostgREST: \`${SUPABASE_IMAGES.rest}\`
- Realtime: \`${SUPABASE_IMAGES.realtime}\`
- Storage: \`${SUPABASE_IMAGES.storage}\`
- Gateway: \`${SUPABASE_IMAGES.gateway}\`
- Studio: \`${SUPABASE_IMAGES.studio}\`

## Host URLs

- App: \`http://127.0.0.1:${supabaseHostPorts.app}\`
- Supabase gateway: \`http://127.0.0.1:${supabaseHostPorts.gateway}\`
- Studio: \`http://127.0.0.1:${supabaseHostPorts.studio}\`
- DB migration endpoint: \`127.0.0.1:${supabaseHostPorts.db}\`

## Runtime Conventions

- Monitoring requested: \`${monitoringEnabled ? 'true' : 'false'}\`
- Auth provider: \`${authProvider}\`
- Authorization engine: \`${authzEngine}\`
${profileModel.enabled ? '- Generated profile reconciliation lives in `supabase/generated/auth_profiles.sql` and records checksum state in `ankhorage_internal.generated_schema_state`.\n' : ''}
`;
}

function getEnvExample(args: {
  appSlug: string;
  domain: string;
  extraEnvEntries: string[];
  defaultAppImage: string;
  supabaseHostPorts: SupabaseHostPorts;
  supabaseLocalEnabled: boolean;
}): string {
  const {
    appSlug,
    domain,
    extraEnvEntries,
    defaultAppImage,
    supabaseHostPorts,
    supabaseLocalEnabled,
  } = args;

  const baseEntries = [
    '# App-owned Minikube profile configuration',
    `ANKH_APP_SLUG=${appSlug}`,
    'MINIKUBE_DRIVER=docker',
    'APP_BUILD_ENABLED=true',
    'APP_SOURCE_DIR=',
    'APP_WEB_EXPORT_DIR=.ankh/web-export',
    `APP_IMAGE=${defaultAppImage}`,
    'APP_IMAGE_SYNC_STRATEGY=docker-load',
    'APP_IMAGE_CLEANUP_ON_DOWN=true',
    'APP_IMAGE_CLEANUP_MINIKUBE=true',
    'APP_IMAGE_CLEANUP_DOCKER=true',
    `APP_PORT_FORWARD_LOCAL_PORT=${supabaseHostPorts.app}`,
    'APP_PORT_FORWARD_REMOTE_PORT=80',
    `SUPABASE_GATEWAY_FORWARD_LOCAL_PORT=${supabaseHostPorts.gateway}`,
    'SUPABASE_GATEWAY_FORWARD_REMOTE_PORT=8000',
    `SUPABASE_STUDIO_FORWARD_LOCAL_PORT=${supabaseHostPorts.studio}`,
    'SUPABASE_STUDIO_FORWARD_REMOTE_PORT=3000',
    `SUPABASE_DB_FORWARD_LOCAL_PORT=${supabaseHostPorts.db}`,
    'SUPABASE_DB_FORWARD_REMOTE_PORT=5432',
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
    '# Supabase Kubernetes runtime secrets',
    `SUPABASE_KUBERNETES_ENABLED=${supabaseLocalEnabled ? 'true' : 'false'}`,
    'POSTGRES_PASSWORD=',
    'JWT_SECRET=',
    'SUPABASE_ANON_KEY=',
    'SUPABASE_SERVICE_ROLE_KEY=',
    'SUPABASE_PUBLISHABLE_KEY=',
    'SUPABASE_SECRET_KEY=',
    'DASHBOARD_USERNAME=supabase',
    'DASHBOARD_PASSWORD=',
    'SITE_URL=',
    'ADDITIONAL_REDIRECT_URLS=',
    'ENABLE_EMAIL_SIGNUP=true',
    'ENABLE_EMAIL_AUTOCONFIRM=true',
    'SMTP_ADMIN_EMAIL=admin@example.com',
    'SMTP_HOST=localhost',
    'SMTP_PORT=2500',
    'SMTP_USER=',
    'SMTP_PASS=',
    'SMTP_SENDER_NAME=Ankhorage',
    'SUPABASE_DB_URL=',
    'EXPO_PUBLIC_SUPABASE_URL=',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY=',
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
    ankhorage.io/namespace-role: ${namespace}
`;
}

function getAppConfigMap(args: {
  appSlug: string;
  authScope: string;
  authProvider: string;
  databaseProvider: string;
  secretStoreProvider: string;
  storageMetadata: AppInfraStorageMetadata | null;
  monitoringEnabled: boolean;
  domain: string;
}): string {
  const {
    appSlug,
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
  namespace: ${APP_NAMESPACE}
data:
  ANKH_APP_SLUG: "${appSlug}"
  DEPLOYMENT_TARGET: "minikube"
  APP_NAMESPACE: "${APP_NAMESPACE}"
  SUPABASE_NAMESPACE: "${SUPABASE_NAMESPACE}"
  MONITORING_ENABLED: "${monitoringEnabled ? 'true' : 'false'}"
  AUTH_SCOPE: "${authScope}"
  AUTH_PROVIDER: "${authProvider}"
  DATABASE_PROVIDER: "${databaseProvider}"
  SECRET_STORE_PROVIDER: "${secretStoreProvider}"
${storageLines}  NETWORK_DOMAIN: "${escapeYamlDoubleQuoted(domain)}"
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

function getKustomizationManifest(args: {
  namespaceResources: string[];
  supabaseEnabled: boolean;
  extraResources: string[];
}): string {
  const supabaseResources = args.supabaseEnabled
    ? [
        'supabase/secrets.yaml',
        'supabase/postgres.pvc.yaml',
        'supabase/postgres.yaml',
        'supabase/auth.yaml',
        'supabase/rest.yaml',
        'supabase/realtime.yaml',
        'supabase/imgproxy.yaml',
        'supabase/storage.yaml',
        'supabase/meta.yaml',
        'supabase/gateway.configmap.yaml',
        'supabase/gateway.yaml',
        'supabase/studio.yaml',
      ]
    : [];
  const resources = [
    ...args.namespaceResources,
    'app.configmap.yaml',
    'app/deployment.yaml',
    'app/service.yaml',
    ...supabaseResources,
    ...args.extraResources,
  ];
  const resourceLines = resources.map((resource) => `  - ${resource}`).join('\n');

  return `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
${resourceLines}
`;
}

function getAppDeploymentManifest(defaultAppImage: string): string {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-runtime
  namespace: ${APP_NAMESPACE}
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
                name: supabase-public-runtime
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

function getAppServiceManifest(): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: app-runtime
  namespace: ${APP_NAMESPACE}
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

function getSupabaseResourceFiles(k8sRoot: string): GeneratedInfrastructureFile[] {
  return [
    {
      path: `${k8sRoot}/supabase/secrets.yaml`,
      content: getSupabaseSecretManifest(),
    },
    {
      path: `${k8sRoot}/supabase/postgres.pvc.yaml`,
      content: getSupabasePvcManifest('supabase-postgres-data', '20Gi'),
    },
    {
      path: `${k8sRoot}/supabase/postgres.yaml`,
      content: getSupabasePostgresManifest(),
    },
    {
      path: `${k8sRoot}/supabase/auth.yaml`,
      content: getSupabaseAuthManifest(),
    },
    {
      path: `${k8sRoot}/supabase/rest.yaml`,
      content: getSupabaseRestManifest(),
    },
    {
      path: `${k8sRoot}/supabase/realtime.yaml`,
      content: getSupabaseRealtimeManifest(),
    },
    {
      path: `${k8sRoot}/supabase/storage.yaml`,
      content: getSupabaseStorageManifest(),
    },
    {
      path: `${k8sRoot}/supabase/imgproxy.yaml`,
      content: getSupabaseImgproxyManifest(),
    },
    {
      path: `${k8sRoot}/supabase/meta.yaml`,
      content: getSupabaseMetaManifest(),
    },
    {
      path: `${k8sRoot}/supabase/gateway.configmap.yaml`,
      content: getSupabaseGatewayConfigMap(),
    },
    {
      path: `${k8sRoot}/supabase/gateway.yaml`,
      content: getSupabaseGatewayManifest(),
    },
    {
      path: `${k8sRoot}/supabase/studio.yaml`,
      content: getSupabaseStudioManifest(),
    },
  ];
}

function getSupabaseSecretManifest(): string {
  return `apiVersion: v1
kind: Secret
metadata:
  name: supabase-runtime-secrets
  namespace: ${SUPABASE_NAMESPACE}
type: Opaque
stringData:
  POSTGRES_PASSWORD: ""
  JWT_SECRET: ""
  SUPABASE_ANON_KEY: ""
  SUPABASE_SERVICE_ROLE_KEY: ""
  SUPABASE_PUBLISHABLE_KEY: ""
  SUPABASE_SECRET_KEY: ""
  DASHBOARD_USERNAME: "supabase"
  DASHBOARD_PASSWORD: ""
`;
}

function getSupabasePvcManifest(name: string, size: string): string {
  return `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${name}
  namespace: ${SUPABASE_NAMESPACE}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: ${size}
`;
}

function getSupabasePostgresManifest(): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: ${SUPABASE_NAMESPACE}
spec:
  selector:
    app.kubernetes.io/name: supabase-postgres
  ports:
    - name: postgres
      port: 5432
      targetPort: postgres
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: ${SUPABASE_NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: supabase-postgres
  template:
    metadata:
      labels:
        app.kubernetes.io/name: supabase-postgres
    spec:
      containers:
        - name: postgres
          image: ${SUPABASE_IMAGES.postgres}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 5432
              name: postgres
          env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: POSTGRES_PASSWORD
            - name: POSTGRES_DB
              value: postgres
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: JWT_SECRET
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "postgres"]
            initialDelaySeconds: 15
            periodSeconds: 5
          livenessProbe:
            exec:
              command: ["pg_isready", "-U", "postgres"]
            initialDelaySeconds: 30
            periodSeconds: 10
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: supabase-postgres-data
`;
}

function getSupabaseAuthManifest(): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: auth
  namespace: ${SUPABASE_NAMESPACE}
spec:
  selector:
    app.kubernetes.io/name: supabase-auth
  ports:
    - name: http
      port: 9999
      targetPort: http
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth
  namespace: ${SUPABASE_NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: supabase-auth
  template:
    metadata:
      labels:
        app.kubernetes.io/name: supabase-auth
    spec:
      containers:
        - name: auth
          image: ${SUPABASE_IMAGES.auth}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 9999
              name: http
          env:
            - name: GOTRUE_API_HOST
              value: "0.0.0.0"
            - name: GOTRUE_API_PORT
              value: "9999"
            - name: API_EXTERNAL_URL
              value: "http://gateway.${SUPABASE_NAMESPACE}.svc.cluster.local:8000/auth/v1"
            - name: GOTRUE_SITE_URL
              value: "$(SITE_URL)"
            - name: GOTRUE_URI_ALLOW_LIST
              value: "$(ADDITIONAL_REDIRECT_URLS)"
            - name: GOTRUE_DB_DRIVER
              value: postgres
            - name: GOTRUE_DB_DATABASE_URL
              value: "postgres://supabase_auth_admin:$(POSTGRES_PASSWORD)@postgres.${SUPABASE_NAMESPACE}.svc.cluster.local:5432/postgres"
            - name: GOTRUE_JWT_AUD
              value: authenticated
            - name: GOTRUE_JWT_DEFAULT_GROUP_NAME
              value: authenticated
            - name: GOTRUE_JWT_ADMIN_ROLES
              value: service_role
            - name: GOTRUE_JWT_EXP
              value: "3600"
            - name: GOTRUE_JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: JWT_SECRET
            - name: GOTRUE_EXTERNAL_EMAIL_ENABLED
              value: "true"
            - name: GOTRUE_MAILER_AUTOCONFIRM
              value: "true"
          envFrom:
            - secretRef:
                name: supabase-runtime-secrets
          readinessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
`;
}

function getSupabaseRestManifest(): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: rest
  namespace: ${SUPABASE_NAMESPACE}
spec:
  selector:
    app.kubernetes.io/name: supabase-rest
  ports:
    - name: http
      port: 3000
      targetPort: http
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rest
  namespace: ${SUPABASE_NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: supabase-rest
  template:
    metadata:
      labels:
        app.kubernetes.io/name: supabase-rest
    spec:
      containers:
        - name: rest
          image: ${SUPABASE_IMAGES.rest}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3000
              name: http
          env:
            - name: PGRST_DB_URI
              value: "postgres://authenticator:$(POSTGRES_PASSWORD)@postgres.${SUPABASE_NAMESPACE}.svc.cluster.local:5432/postgres"
            - name: PGRST_DB_SCHEMAS
              value: "public,storage,graphql_public"
            - name: PGRST_DB_ANON_ROLE
              value: anon
            - name: PGRST_JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: JWT_SECRET
            - name: PGRST_DB_USE_LEGACY_GUCS
              value: "false"
          envFrom:
            - secretRef:
                name: supabase-runtime-secrets
`;
}

function getSupabaseRealtimeManifest(): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: realtime
  namespace: ${SUPABASE_NAMESPACE}
spec:
  selector:
    app.kubernetes.io/name: supabase-realtime
  ports:
    - name: http
      port: 4000
      targetPort: http
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: realtime
  namespace: ${SUPABASE_NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: supabase-realtime
  template:
    metadata:
      labels:
        app.kubernetes.io/name: supabase-realtime
    spec:
      containers:
        - name: realtime
          image: ${SUPABASE_IMAGES.realtime}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 4000
              name: http
          env:
            - name: PORT
              value: "4000"
            - name: DB_HOST
              value: "postgres.${SUPABASE_NAMESPACE}.svc.cluster.local"
            - name: DB_PORT
              value: "5432"
            - name: DB_NAME
              value: postgres
            - name: DB_USER
              value: supabase_admin
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: POSTGRES_PASSWORD
            - name: API_JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: JWT_SECRET
            - name: SECRET_KEY_BASE
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: JWT_SECRET
`;
}

function getSupabaseStorageManifest(): string {
  return `${getSupabasePvcManifest('supabase-storage-data', '10Gi')}
---
apiVersion: v1
kind: Service
metadata:
  name: storage
  namespace: ${SUPABASE_NAMESPACE}
spec:
  selector:
    app.kubernetes.io/name: supabase-storage
  ports:
    - name: http
      port: 5000
      targetPort: http
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: storage
  namespace: ${SUPABASE_NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: supabase-storage
  template:
    metadata:
      labels:
        app.kubernetes.io/name: supabase-storage
    spec:
      containers:
        - name: storage
          image: ${SUPABASE_IMAGES.storage}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 5000
              name: http
          env:
            - name: ANON_KEY
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: SUPABASE_ANON_KEY
            - name: SERVICE_KEY
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: SUPABASE_SERVICE_ROLE_KEY
            - name: AUTH_JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: JWT_SECRET
            - name: DATABASE_URL
              value: "postgres://supabase_storage_admin:$(POSTGRES_PASSWORD)@postgres.${SUPABASE_NAMESPACE}.svc.cluster.local:5432/postgres"
            - name: POSTGREST_URL
              value: "http://rest.${SUPABASE_NAMESPACE}.svc.cluster.local:3000"
            - name: STORAGE_BACKEND
              value: file
            - name: FILE_STORAGE_BACKEND_PATH
              value: /var/lib/storage
            - name: TENANT_ID
              value: stub
            - name: REGION
              value: local
            - name: GLOBAL_S3_BUCKET
              value: local
            - name: IMGPROXY_URL
              value: "http://imgproxy.${SUPABASE_NAMESPACE}.svc.cluster.local:5001"
          envFrom:
            - secretRef:
                name: supabase-runtime-secrets
          volumeMounts:
            - name: storage
              mountPath: /var/lib/storage
      volumes:
        - name: storage
          persistentVolumeClaim:
            claimName: supabase-storage-data
`;
}

function getSupabaseImgproxyManifest(): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: imgproxy
  namespace: ${SUPABASE_NAMESPACE}
spec:
  selector:
    app.kubernetes.io/name: supabase-imgproxy
  ports:
    - name: http
      port: 5001
      targetPort: http
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: imgproxy
  namespace: ${SUPABASE_NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: supabase-imgproxy
  template:
    metadata:
      labels:
        app.kubernetes.io/name: supabase-imgproxy
    spec:
      containers:
        - name: imgproxy
          image: ${SUPABASE_IMAGES.imgproxy}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 5001
              name: http
          env:
            - name: IMGPROXY_BIND
              value: ":5001"
`;
}

function getSupabaseMetaManifest(): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: meta
  namespace: ${SUPABASE_NAMESPACE}
spec:
  selector:
    app.kubernetes.io/name: supabase-meta
  ports:
    - name: http
      port: 8080
      targetPort: http
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: meta
  namespace: ${SUPABASE_NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: supabase-meta
  template:
    metadata:
      labels:
        app.kubernetes.io/name: supabase-meta
    spec:
      containers:
        - name: meta
          image: ${SUPABASE_IMAGES.meta}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
              name: http
          env:
            - name: PG_META_PORT
              value: "8080"
            - name: PG_META_DB_HOST
              value: "postgres.${SUPABASE_NAMESPACE}.svc.cluster.local"
            - name: PG_META_DB_PORT
              value: "5432"
            - name: PG_META_DB_NAME
              value: postgres
            - name: PG_META_DB_USER
              value: postgres
            - name: PG_META_DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: POSTGRES_PASSWORD
            - name: CRYPTO_KEY
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: JWT_SECRET
`;
}

function getSupabaseGatewayConfigMap(): string {
  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: supabase-gateway-config
  namespace: ${SUPABASE_NAMESPACE}
data:
  kong.yml: |
    _format_version: "3.0"
    services:
      - name: auth
        url: http://auth.${SUPABASE_NAMESPACE}.svc.cluster.local:9999
        routes:
          - name: auth-v1
            paths: ["/auth/v1"]
            strip_path: true
      - name: rest
        url: http://rest.${SUPABASE_NAMESPACE}.svc.cluster.local:3000
        routes:
          - name: rest-v1
            paths: ["/rest/v1"]
            strip_path: true
      - name: realtime
        url: http://realtime.${SUPABASE_NAMESPACE}.svc.cluster.local:4000
        routes:
          - name: realtime-v1
            paths: ["/realtime/v1"]
            strip_path: true
      - name: storage
        url: http://storage.${SUPABASE_NAMESPACE}.svc.cluster.local:5000
        routes:
          - name: storage-v1
            paths: ["/storage/v1"]
            strip_path: true
      - name: studio
        url: http://studio.${SUPABASE_NAMESPACE}.svc.cluster.local:3000
        routes:
          - name: studio
            paths: ["/"]
            strip_path: false
`;
}

function getSupabaseGatewayManifest(): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: gateway
  namespace: ${SUPABASE_NAMESPACE}
spec:
  selector:
    app.kubernetes.io/name: supabase-gateway
  ports:
    - name: http
      port: 8000
      targetPort: http
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gateway
  namespace: ${SUPABASE_NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: supabase-gateway
  template:
    metadata:
      labels:
        app.kubernetes.io/name: supabase-gateway
    spec:
      containers:
        - name: gateway
          image: ${SUPABASE_IMAGES.gateway}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8000
              name: http
          env:
            - name: KONG_DATABASE
              value: "off"
            - name: KONG_DECLARATIVE_CONFIG
              value: /kong/kong.yml
            - name: KONG_PROXY_LISTEN
              value: "0.0.0.0:8000"
          volumeMounts:
            - name: config
              mountPath: /kong
              readOnly: true
          readinessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
      volumes:
        - name: config
          configMap:
            name: supabase-gateway-config
`;
}

function getSupabaseStudioManifest(): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: studio
  namespace: ${SUPABASE_NAMESPACE}
spec:
  selector:
    app.kubernetes.io/name: supabase-studio
  ports:
    - name: http
      port: 3000
      targetPort: http
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: studio
  namespace: ${SUPABASE_NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: supabase-studio
  template:
    metadata:
      labels:
        app.kubernetes.io/name: supabase-studio
    spec:
      containers:
        - name: studio
          image: ${SUPABASE_IMAGES.studio}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3000
              name: http
          env:
            - name: HOSTNAME
              value: "0.0.0.0"
            - name: STUDIO_PG_META_URL
              value: "http://meta.${SUPABASE_NAMESPACE}.svc.cluster.local:8080"
            - name: SUPABASE_URL
              value: "http://gateway.${SUPABASE_NAMESPACE}.svc.cluster.local:8000"
            - name: SUPABASE_PUBLIC_URL
              value: "http://gateway.${SUPABASE_NAMESPACE}.svc.cluster.local:8000"
            - name: SUPABASE_ANON_KEY
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: SUPABASE_ANON_KEY
            - name: SUPABASE_SERVICE_KEY
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: SUPABASE_SERVICE_ROLE_KEY
            - name: AUTH_JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: supabase-runtime-secrets
                  key: JWT_SECRET
          envFrom:
            - secretRef:
                name: supabase-runtime-secrets
`;
}

function getUpScript(args: {
  appSlug: string;
  defaultAppImage: string;
  supabaseLocalEnabled: boolean;
  profileModel: ResolvedProfileModel;
}): string {
  const { appSlug, defaultAppImage, supabaseLocalEnabled, profileModel } = args;

  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"
K8S_DIR="\${ROOT_DIR}/k8s"
BUILD_SCRIPT="\${SCRIPT_DIR}/build-app-image.sh"
PORT_FORWARD_SCRIPT="\${SCRIPT_DIR}/port-forward.sh"
APP_SLUG="${appSlug}"
PROFILE="\${ANKH_APP_SLUG:-${appSlug}}"
DRIVER="\${MINIKUBE_DRIVER:-docker}"
APP_NAMESPACE="${APP_NAMESPACE}"
SUPABASE_NAMESPACE="${SUPABASE_NAMESPACE}"
SUPABASE_KUBERNETES_ENABLED="\${SUPABASE_KUBERNETES_ENABLED:-${supabaseLocalEnabled ? 'true' : 'false'}}"
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
SUPABASE_DB_FORWARD_LOCAL_PORT="\${SUPABASE_DB_FORWARD_LOCAL_PORT:-54322}"
SUPABASE_DB_URL="\${SUPABASE_DB_URL:-postgres://postgres:\${POSTGRES_PASSWORD:-}@127.0.0.1:\${SUPABASE_DB_FORWARD_LOCAL_PORT}/postgres}"
SUPABASE_PROFILE_ENABLED="${profileModel.enabled ? 'true' : 'false'}"
SUPABASE_PROFILE_RECONCILE_FILE="\${ROOT_DIR}/supabase/generated/auth_profiles.sql"

if [[ -f "\${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\${ROOT_DIR}/.env"
  set +a
fi

if [[ "\${PROFILE}" != "\${APP_SLUG}" ]]; then
  echo "ANKH_APP_SLUG must remain the generated canonical slug '\${APP_SLUG}' for this infra directory."
  exit 1
fi

require_command() {
  if ! command -v "\${1}" >/dev/null 2>&1; then
    echo "\${1} is required but not installed."
    exit 1
  fi
}

require_supabase_secrets() {
  if [[ "\${SUPABASE_KUBERNETES_ENABLED}" != "true" ]]; then
    return 0
  fi

  local missing=()
  for key in POSTGRES_PASSWORD JWT_SECRET SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
    if [[ -z "\${!key:-}" ]]; then
      missing+=("\${key}")
    fi
  done

  if (( \${#missing[@]} > 0 )); then
    echo "Missing required Supabase Kubernetes secrets in infra/minikube/.env: \${missing[*]}"
    exit 1
  fi
}

sync_supabase_secrets() {
  if [[ "\${SUPABASE_KUBERNETES_ENABLED}" != "true" ]]; then
    return 0
  fi

  local tmp_runtime tmp_public
  tmp_runtime="$(mktemp)"
  tmp_public="$(mktemp)"
  trap 'rm -f "\${tmp_runtime}" "\${tmp_public}"' EXIT

  cat > "\${tmp_runtime}" <<EOF
POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
JWT_SECRET=\${JWT_SECRET}
SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=\${SUPABASE_SERVICE_ROLE_KEY}
SUPABASE_PUBLISHABLE_KEY=\${SUPABASE_PUBLISHABLE_KEY:-}
SUPABASE_SECRET_KEY=\${SUPABASE_SECRET_KEY:-}
DASHBOARD_USERNAME=\${DASHBOARD_USERNAME:-supabase}
DASHBOARD_PASSWORD=\${DASHBOARD_PASSWORD:-}
EOF

  kubectl --context "\${PROFILE}" -n "\${SUPABASE_NAMESPACE}" create secret generic supabase-runtime-secrets --from-env-file="\${tmp_runtime}" --dry-run=client -o yaml | kubectl --context "\${PROFILE}" -n "\${SUPABASE_NAMESPACE}" apply -f -

  cat > "\${tmp_public}" <<EOF
EXPO_PUBLIC_SUPABASE_URL=\${EXPO_PUBLIC_SUPABASE_URL:-http://127.0.0.1:\${SUPABASE_GATEWAY_FORWARD_LOCAL_PORT:-54321}}
EXPO_PUBLIC_SUPABASE_ANON_KEY=\${EXPO_PUBLIC_SUPABASE_ANON_KEY:-\${SUPABASE_ANON_KEY}}
SUPABASE_URL=http://gateway.${SUPABASE_NAMESPACE}.svc.cluster.local:8000
SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY}
EOF

  kubectl --context "\${PROFILE}" -n "\${APP_NAMESPACE}" create secret generic supabase-public-runtime --from-env-file="\${tmp_public}" --dry-run=client -o yaml | kubectl --context "\${PROFILE}" -n "\${APP_NAMESPACE}" apply -f -

  rm -f "\${tmp_runtime}" "\${tmp_public}"
  trap - EXIT
}

docker_load_image_to_minikube() {
  if command -v docker >/dev/null 2>&1 && docker image inspect "\${APP_IMAGE}" >/dev/null 2>&1; then
    minikube -p "\${PROFILE}" image load --daemon=true --overwrite=true "\${APP_IMAGE}" >/dev/null
    return 0
  fi

  return 1
}

run_supabase_migrations() {
  if [[ "\${SUPABASE_KUBERNETES_ENABLED}" != "true" ]]; then
    return 0
  fi

  require_command supabase
  require_command psql

  "\${PORT_FORWARD_SCRIPT}" start db-migration >/dev/null
  export SUPABASE_DB_URL

  if [[ -d "\${ROOT_DIR}/supabase/migrations" ]]; then
    supabase migration up --db-url "\${SUPABASE_DB_URL}"
  fi

  if [[ "\${SUPABASE_PROFILE_ENABLED}" == "true" && -f "\${SUPABASE_PROFILE_RECONCILE_FILE}" ]]; then
    psql "\${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -q -f "\${SUPABASE_PROFILE_RECONCILE_FILE}"
  fi
}

require_command minikube
require_command kubectl
require_supabase_secrets

HOST_STATUS="$(minikube -p "\${PROFILE}" status --format='{{.Host}}' 2>/dev/null || true)"
if [[ "\${HOST_STATUS}" != "Running" ]]; then
  minikube start -p "\${PROFILE}" --driver="\${DRIVER}"
fi

kubectl --context "\${PROFILE}" apply -k "\${K8S_DIR}"

sync_supabase_secrets

if [[ "\${SUPABASE_KUBERNETES_ENABLED}" == "true" ]]; then
  kubectl --context "\${PROFILE}" -n "\${SUPABASE_NAMESPACE}" rollout status deployment/postgres --timeout=240s
  kubectl --context "\${PROFILE}" -n "\${SUPABASE_NAMESPACE}" rollout status deployment/auth --timeout=240s
  kubectl --context "\${PROFILE}" -n "\${SUPABASE_NAMESPACE}" rollout status deployment/rest --timeout=240s
  kubectl --context "\${PROFILE}" -n "\${SUPABASE_NAMESPACE}" rollout status deployment/storage --timeout=240s
  kubectl --context "\${PROFILE}" -n "\${SUPABASE_NAMESPACE}" rollout status deployment/gateway --timeout=240s
  "\${PORT_FORWARD_SCRIPT}" start supabase-gateway >/dev/null
  "\${PORT_FORWARD_SCRIPT}" start studio >/dev/null
  run_supabase_migrations
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

case "\${APP_IMAGE_SYNC_STRATEGY}" in
  minikube-build)
    if [[ ! -f "\${EXPORT_DIR}/index.html" ]]; then
      echo "Expected web export output not found at \${EXPORT_DIR}/index.html"
      exit 1
    fi
    minikube -p "\${PROFILE}" image build -t "\${APP_IMAGE}" -f "\${ROOT_DIR}/app-image/Dockerfile" "\${EXPORT_DIR}" >/dev/null
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

if [[ -n "\${APP_IMAGE_PULL_SECRET_NAME}" ]]; then
  if [[ -z "\${APP_IMAGE_PULL_SECRET_USERNAME}" || -z "\${APP_IMAGE_PULL_SECRET_PASSWORD}" ]]; then
    echo "APP_IMAGE_PULL_SECRET_NAME is set, but username/password are missing."
    exit 1
  fi

  SECRET_EMAIL_ARG=()
  if [[ -n "\${APP_IMAGE_PULL_SECRET_EMAIL}" ]]; then
    SECRET_EMAIL_ARG=(--docker-email="\${APP_IMAGE_PULL_SECRET_EMAIL}")
  fi

  kubectl --context "\${PROFILE}" -n "\${APP_NAMESPACE}" create secret docker-registry "\${APP_IMAGE_PULL_SECRET_NAME}" --docker-server="\${APP_IMAGE_PULL_SECRET_SERVER}" --docker-username="\${APP_IMAGE_PULL_SECRET_USERNAME}" --docker-password="\${APP_IMAGE_PULL_SECRET_PASSWORD}" "\${SECRET_EMAIL_ARG[@]}" --dry-run=client -o yaml | kubectl --context "\${PROFILE}" -n "\${APP_NAMESPACE}" apply -f -

  PULL_SECRET_PATCH="$(cat <<EOF
{"spec":{"template":{"spec":{"imagePullSecrets":[{"name":"\${APP_IMAGE_PULL_SECRET_NAME}"}]}}}}
EOF
)"
  kubectl --context "\${PROFILE}" -n "\${APP_NAMESPACE}" patch deployment app-runtime --type=merge --patch "\${PULL_SECRET_PATCH}" >/dev/null
else
  kubectl --context "\${PROFILE}" -n "\${APP_NAMESPACE}" patch deployment app-runtime --type=json --patch='[{"op":"remove","path":"/spec/template/spec/imagePullSecrets"}]' >/dev/null 2>&1 || true
fi

kubectl --context "\${PROFILE}" -n "\${APP_NAMESPACE}" set image deployment/app-runtime app="\${APP_IMAGE}" >/dev/null
kubectl --context "\${PROFILE}" -n "\${APP_NAMESPACE}" scale deployment/app-runtime --replicas="\${APP_REPLICAS}" >/dev/null

if [[ "\${APP_FORCE_ROLLOUT_RESTART}" == "true" ]]; then
  kubectl --context "\${PROFILE}" -n "\${APP_NAMESPACE}" rollout restart deployment/app-runtime >/dev/null
fi

kubectl --context "\${PROFILE}" -n "\${APP_NAMESPACE}" rollout status deployment/app-runtime --timeout=180s >/dev/null
"\${PORT_FORWARD_SCRIPT}" start app >/dev/null

echo "Minikube infrastructure for '\${PROFILE}' is running."
`;
}

function getBuildAppImageScript(args: { appSlug: string; defaultAppImage: string }): string {
  const { appSlug, defaultAppImage } = args;

  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"
DOCKERFILE_PATH="\${ROOT_DIR}/app-image/Dockerfile"
APP_SLUG="${appSlug}"

if [[ -f "\${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\${ROOT_DIR}/.env"
  set +a
fi

PROFILE="\${ANKH_APP_SLUG:-${appSlug}}"
APP_BUILD_ENABLED="\${APP_BUILD_ENABLED:-true}"
APP_SOURCE_DIR="\${APP_SOURCE_DIR:-$(cd "\${ROOT_DIR}/../.." && pwd)}"
APP_WEB_EXPORT_DIR="\${APP_WEB_EXPORT_DIR:-.ankh/web-export}"
APP_IMAGE="\${APP_IMAGE:-${defaultAppImage}}"

if [[ "\${PROFILE}" != "\${APP_SLUG}" ]]; then
  echo "ANKH_APP_SLUG must remain the generated canonical slug '\${APP_SLUG}' for this infra directory."
  exit 1
fi

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
  --label "ankhorage.app_slug=\${PROFILE}" \
  --label "ankhorage.image=\${APP_IMAGE}" \
  -f "\${DOCKERFILE_PATH}" \
  "\${EXPORT_DIR}"
echo "Built app image: \${APP_IMAGE} (profile: \${PROFILE})"
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

function getPortForwardScript(args: {
  appSlug: string;
  supabaseLocalEnabled: boolean;
  supabaseHostPorts: SupabaseHostPorts;
}): string {
  const { appSlug, supabaseLocalEnabled, supabaseHostPorts } = args;

  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"
STATE_DIR="\${ROOT_DIR}/.state/forwards"
APP_SLUG="${appSlug}"
PROFILE="\${ANKH_APP_SLUG:-${appSlug}}"
SUPABASE_KUBERNETES_ENABLED="\${SUPABASE_KUBERNETES_ENABLED:-${supabaseLocalEnabled ? 'true' : 'false'}}"
APP_PORT_FORWARD_LOCAL_PORT="\${APP_PORT_FORWARD_LOCAL_PORT:-${supabaseHostPorts.app}}"
APP_PORT_FORWARD_REMOTE_PORT="\${APP_PORT_FORWARD_REMOTE_PORT:-80}"
SUPABASE_GATEWAY_FORWARD_LOCAL_PORT="\${SUPABASE_GATEWAY_FORWARD_LOCAL_PORT:-${supabaseHostPorts.gateway}}"
SUPABASE_GATEWAY_FORWARD_REMOTE_PORT="\${SUPABASE_GATEWAY_FORWARD_REMOTE_PORT:-8000}"
SUPABASE_STUDIO_FORWARD_LOCAL_PORT="\${SUPABASE_STUDIO_FORWARD_LOCAL_PORT:-${supabaseHostPorts.studio}}"
SUPABASE_STUDIO_FORWARD_REMOTE_PORT="\${SUPABASE_STUDIO_FORWARD_REMOTE_PORT:-3000}"
SUPABASE_DB_FORWARD_LOCAL_PORT="\${SUPABASE_DB_FORWARD_LOCAL_PORT:-${supabaseHostPorts.db}}"
SUPABASE_DB_FORWARD_REMOTE_PORT="\${SUPABASE_DB_FORWARD_REMOTE_PORT:-5432}"

if [[ -f "\${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\${ROOT_DIR}/.env"
  set +a
fi

if [[ "\${PROFILE}" != "\${APP_SLUG}" ]]; then
  echo "ANKH_APP_SLUG must remain the generated canonical slug '\${APP_SLUG}' for this infra directory."
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required but not installed."
  exit 1
fi

mkdir -p "\${STATE_DIR}"

pid_file_for() {
  echo "\${STATE_DIR}/\${PROFILE}-\${1}.pid"
}

target_for() {
  case "\${1}" in
    app)
      echo "${APP_NAMESPACE} service/app-runtime \${APP_PORT_FORWARD_LOCAL_PORT} \${APP_PORT_FORWARD_REMOTE_PORT}"
      ;;
    supabase-gateway)
      echo "${SUPABASE_NAMESPACE} service/gateway \${SUPABASE_GATEWAY_FORWARD_LOCAL_PORT} \${SUPABASE_GATEWAY_FORWARD_REMOTE_PORT}"
      ;;
    studio)
      echo "${SUPABASE_NAMESPACE} service/studio \${SUPABASE_STUDIO_FORWARD_LOCAL_PORT} \${SUPABASE_STUDIO_FORWARD_REMOTE_PORT}"
      ;;
    db-migration)
      echo "${SUPABASE_NAMESPACE} service/postgres \${SUPABASE_DB_FORWARD_LOCAL_PORT} \${SUPABASE_DB_FORWARD_REMOTE_PORT}"
      ;;
    *)
      echo "Unknown forward '\${1}'. Use app, supabase-gateway, studio, db-migration, or all." >&2
      return 1
      ;;
  esac
}

is_pid_running() {
  local pid="\${1}"
  [[ -n "\${pid}" ]] && kill -0 "\${pid}" >/dev/null 2>&1
}

start_forward() {
  local name="\${1}"
  local pid_file
  pid_file="$(pid_file_for "\${name}")"
  if [[ -f "\${pid_file}" ]]; then
    local existing_pid
    existing_pid="$(cat "\${pid_file}")"
    if is_pid_running "\${existing_pid}"; then
      echo "\${name}: running (pid \${existing_pid})"
      return 0
    fi
    rm -f "\${pid_file}"
  fi

  read -r namespace resource local_port remote_port <<<"$(target_for "\${name}")"
  if [[ "\${namespace}" == "${SUPABASE_NAMESPACE}" && "\${SUPABASE_KUBERNETES_ENABLED}" != "true" ]]; then
    echo "\${name}: skipped (Supabase Kubernetes disabled)"
    return 0
  fi

  if ! kubectl --context "\${PROFILE}" -n "\${namespace}" get "\${resource}" >/dev/null 2>&1; then
    echo "\${name}: target \${namespace}/\${resource} not found"
    return 1
  fi

  nohup kubectl --context "\${PROFILE}" -n "\${namespace}" port-forward "\${resource}" "\${local_port}:\${remote_port}" >"\${STATE_DIR}/\${PROFILE}-\${name}.log" 2>&1 &
  local pid="$!"
  echo "\${pid}" > "\${pid_file}"
  sleep 1
  if ! is_pid_running "\${pid}"; then
    echo "\${name}: failed to start; see \${STATE_DIR}/\${PROFILE}-\${name}.log"
    rm -f "\${pid_file}"
    return 1
  fi
  echo "\${name}: started (pid \${pid}, local port \${local_port})"
}

stop_forward() {
  local name="\${1}"
  local pid_file
  pid_file="$(pid_file_for "\${name}")"
  if [[ ! -f "\${pid_file}" ]]; then
    echo "\${name}: stopped"
    return 0
  fi

  local pid
  pid="$(cat "\${pid_file}")"
  if is_pid_running "\${pid}"; then
    kill "\${pid}" >/dev/null 2>&1 || true
  fi
  rm -f "\${pid_file}"
  echo "\${name}: stopped"
}

status_forward() {
  local name="\${1}"
  local pid_file
  pid_file="$(pid_file_for "\${name}")"
  if [[ ! -f "\${pid_file}" ]]; then
    echo "\${name}: stopped"
    return 0
  fi

  local pid
  pid="$(cat "\${pid_file}")"
  if is_pid_running "\${pid}"; then
    read -r namespace resource local_port remote_port <<<"$(target_for "\${name}")"
    echo "\${name}: running pid=\${pid} url=127.0.0.1:\${local_port} target=\${namespace}/\${resource}:\${remote_port}"
    return 0
  fi

  echo "\${name}: crashed stale_pid=\${pid}"
  rm -f "\${pid_file}"
}

for_each_forward() {
  local action="\${1}"
  "\${action}_forward" app
  if [[ "\${SUPABASE_KUBERNETES_ENABLED}" == "true" ]]; then
    "\${action}_forward" supabase-gateway
    "\${action}_forward" studio
    "\${action}_forward" db-migration
  fi
}

ACTION="\${1:-start}"
NAME="\${2:-all}"

case "\${ACTION}:\${NAME}" in
  start:all) for_each_forward start ;;
  stop:all) for_each_forward stop ;;
  status:all) for_each_forward status ;;
  start:*) start_forward "\${NAME}" ;;
  stop:*) stop_forward "\${NAME}" ;;
  status:*) status_forward "\${NAME}" ;;
  *)
    echo "Usage: ./scripts/port-forward.sh {start|stop|status} {app|supabase-gateway|studio|db-migration|all}"
    exit 1
    ;;
esac
`;
}

function getDownScript(appSlug: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"
APP_SLUG="${appSlug}"
PROFILE="\${ANKH_APP_SLUG:-${appSlug}}"

if [[ -f "\${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\${ROOT_DIR}/.env"
  set +a
fi

if [[ "\${PROFILE}" != "\${APP_SLUG}" ]]; then
  echo "ANKH_APP_SLUG must remain the generated canonical slug '\${APP_SLUG}' for this infra directory."
  exit 1
fi

"\${SCRIPT_DIR}/port-forward.sh" stop all >/dev/null || true

if command -v minikube >/dev/null 2>&1; then
  minikube stop -p "\${PROFILE}"
else
  echo "minikube is required but not installed."
  exit 1
fi

echo "Stopped Minikube profile '\${PROFILE}'. Persistent data remains in the profile."
`;
}

function getResetScript(appSlug: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"
K8S_DIR="\${ROOT_DIR}/k8s"
APP_SLUG="${appSlug}"
PROFILE="\${ANKH_APP_SLUG:-${appSlug}}"
CONFIRM="\${ANKH_RESET_CONFIRM:-}"

if [[ -f "\${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\${ROOT_DIR}/.env"
  set +a
fi

if [[ "\${PROFILE}" != "\${APP_SLUG}" ]]; then
  echo "ANKH_APP_SLUG must remain the generated canonical slug '\${APP_SLUG}' for this infra directory."
  exit 1
fi

if [[ "\${CONFIRM}" != "\${APP_SLUG}" ]]; then
  echo "Refusing reset. Set ANKH_RESET_CONFIRM=\${APP_SLUG} to reset app and Supabase Kubernetes namespaces inside profile '\${PROFILE}'."
  echo "reset.sh deletes namespace app and namespace supabase, including Supabase DB and Storage PVC data. It does not delete the Minikube profile."
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required but not installed."
  exit 1
fi

"\${SCRIPT_DIR}/port-forward.sh" stop all >/dev/null || true
kubectl --context "\${PROFILE}" delete namespace ${APP_NAMESPACE} --ignore-not-found
kubectl --context "\${PROFILE}" delete namespace ${SUPABASE_NAMESPACE} --ignore-not-found
kubectl --context "\${PROFILE}" apply -k "\${K8S_DIR}"
echo "Reset Kubernetes namespaces for profile '\${PROFILE}'. Run ./scripts/up.sh to reconcile secrets, migrations, forwards, and app rollout."
`;
}

function getDestroyScript(appSlug: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"
APP_SLUG="${appSlug}"
PROFILE="\${ANKH_APP_SLUG:-${appSlug}}"

if [[ -f "\${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\${ROOT_DIR}/.env"
  set +a
fi

if [[ "\${PROFILE}" != "\${APP_SLUG}" ]]; then
  echo "ANKH_APP_SLUG must remain the generated canonical slug '\${APP_SLUG}' for this infra directory."
  exit 1
fi

"\${SCRIPT_DIR}/port-forward.sh" stop all >/dev/null || true
minikube delete -p "\${PROFILE}"
echo "Deleted Minikube profile '\${PROFILE}'."
`;
}

function getStatusScript(args: {
  appSlug: string;
  supabaseLocalEnabled: boolean;
  profileModel: ResolvedProfileModel;
}): string {
  const { appSlug, supabaseLocalEnabled, profileModel } = args;

  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"
APP_SLUG="${appSlug}"
PROFILE="\${ANKH_APP_SLUG:-${appSlug}}"
SUPABASE_KUBERNETES_ENABLED="\${SUPABASE_KUBERNETES_ENABLED:-${supabaseLocalEnabled ? 'true' : 'false'}}"
SUPABASE_PROFILE_ENABLED="${profileModel.enabled ? 'true' : 'false'}"

if [[ -f "\${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\${ROOT_DIR}/.env"
  set +a
fi

if [[ "\${PROFILE}" != "\${APP_SLUG}" ]]; then
  echo "ANKH_APP_SLUG must remain the generated canonical slug '\${APP_SLUG}' for this infra directory."
  exit 1
fi

echo "Infra status for profile: \${PROFILE}"

if ! command -v minikube >/dev/null 2>&1; then
  echo "- minikube: missing"
  exit 1
fi

HOST_STATUS="$(minikube -p "\${PROFILE}" status --format='{{.Host}}' 2>/dev/null || true)"
echo "- minikube host: \${HOST_STATUS:-missing}"

if [[ "\${HOST_STATUS}" != "Running" ]]; then
  echo "- cluster: stopped"
  "\${SCRIPT_DIR}/port-forward.sh" status all || true
  exit 0
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "- kubectl: missing"
  exit 1
fi

for namespace in ${APP_NAMESPACE} ${SUPABASE_NAMESPACE}; do
  if kubectl --context "\${PROFILE}" get namespace "\${namespace}" >/dev/null 2>&1; then
    echo "- namespace/\${namespace}: present"
    kubectl --context "\${PROFILE}" -n "\${namespace}" get pods
  else
    echo "- namespace/\${namespace}: missing"
  fi
done

if kubectl --context "\${PROFILE}" -n ${APP_NAMESPACE} get deployment app-runtime >/dev/null 2>&1; then
  kubectl --context "\${PROFILE}" -n ${APP_NAMESPACE} rollout status deployment/app-runtime --timeout=5s >/dev/null 2>&1 && echo "- app-runtime: ready" || echo "- app-runtime: not ready"
fi

if [[ "\${SUPABASE_KUBERNETES_ENABLED}" == "true" ]]; then
  for deployment in postgres auth rest realtime storage gateway studio; do
    if kubectl --context "\${PROFILE}" -n ${SUPABASE_NAMESPACE} get deployment "\${deployment}" >/dev/null 2>&1; then
      kubectl --context "\${PROFILE}" -n ${SUPABASE_NAMESPACE} rollout status "deployment/\${deployment}" --timeout=5s >/dev/null 2>&1 && echo "- supabase/\${deployment}: ready" || echo "- supabase/\${deployment}: not ready"
    else
      echo "- supabase/\${deployment}: missing"
    fi
  done
  if [[ "\${SUPABASE_PROFILE_ENABLED}" == "true" ]]; then
    echo "- profile reconciliation: generated"
  else
    echo "- profile reconciliation: disabled"
  fi
fi

"\${SCRIPT_DIR}/port-forward.sh" status all || true
`;
}

function getDefaultAppImage(appSlug: string): string {
  return `ankh/${appSlug}:dev`;
}

function resolveSupabaseHostPorts(appSlug: string): SupabaseHostPorts {
  const base = PORT_BASE + resolvePortBucket(appSlug) * PORT_BUCKET_SIZE;
  return {
    app: base,
    gateway: base + 1,
    studio: base + 2,
    db: base + 3,
  };
}

function resolvePortBucket(appSlug: string): number {
  const rawBucket = hashSlug(appSlug) - hashSlug(PORT_REFERENCE_SLUG);
  return (rawBucket + PORT_BUCKET_COUNT) % PORT_BUCKET_COUNT;
}

function hashSlug(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % PORT_BUCKET_COUNT;
  }
  return hash;
}

function escapeYamlDoubleQuoted(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
