import type { MinikubeAdapterArtifacts } from '../../contracts';

export function generateSupabaseStorageArtifacts(args: {
  namespace: string;
  buckets: string[];
  includeSupabaseConnectionEnvEntries: boolean;
}): MinikubeAdapterArtifacts {
  const { namespace, buckets, includeSupabaseConnectionEnvEntries } = args;
  const root = 'infra/minikube/k8s/storage/supabase';
  const resourceRoot = 'storage/supabase';
  const bucketsCsv = buckets.join(',');
  const defaultBucket = buckets[0] ?? '';

  const envEntries = [
    'STORAGE_PROVIDER=supabase',
    'STORAGE_RUNTIME_MODE=local',
    `STORAGE_BUCKETS=${bucketsCsv}`,
    `STORAGE_DEFAULT_BUCKET=${defaultBucket}`,
    'EXPO_PUBLIC_STORAGE_PROVIDER=supabase',
    `EXPO_PUBLIC_STORAGE_BUCKETS=${bucketsCsv}`,
    `EXPO_PUBLIC_STORAGE_DEFAULT_BUCKET=${defaultBucket}`,
  ];

  if (includeSupabaseConnectionEnvEntries) {
    envEntries.push(
      '',
      '# Supabase provider connection details',
      'SUPABASE_SECRET_SYNC_ENABLED=true',
      'SUPABASE_URL=',
      'SUPABASE_ANON_KEY=',
      'SUPABASE_SERVICE_ROLE_KEY=',
      'SUPABASE_JWT_SECRET=',
      'EXPO_PUBLIC_SUPABASE_URL=',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY=',
    );
  }

  return {
    files: [
      {
        path: `${root}/supabase-storage.configmap.yaml`,
        content: getSupabaseStorageConfigMap({
          namespace,
          bucketsCsv,
          defaultBucket,
        }),
      },
      {
        path: `${root}/app-runtime-storage.env.configmap.yaml`,
        content: getRuntimeStorageEnvConfigMap({
          namespace,
          bucketsCsv,
          defaultBucket,
        }),
      },
    ],
    resources: [
      `${resourceRoot}/supabase-storage.configmap.yaml`,
      `${resourceRoot}/app-runtime-storage.env.configmap.yaml`,
    ],
    envEntries,
    warnings: [
      `Storage buckets are configured but not created automatically yet. Ensure buckets exist in Supabase Storage: ${bucketsCsv}.`,
    ],
  };
}

function getSupabaseStorageConfigMap(args: {
  namespace: string;
  bucketsCsv: string;
  defaultBucket: string;
}) {
  const { namespace, bucketsCsv, defaultBucket } = args;

  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: supabase-storage-config
  namespace: ${namespace}
data:
  STORAGE_PROVIDER: "supabase"
  STORAGE_BUCKETS: "${escapeYamlDoubleQuoted(bucketsCsv)}"
  STORAGE_DEFAULT_BUCKET: "${escapeYamlDoubleQuoted(defaultBucket)}"
`;
}

function getRuntimeStorageEnvConfigMap(args: {
  namespace: string;
  bucketsCsv: string;
  defaultBucket: string;
}) {
  const { namespace, bucketsCsv, defaultBucket } = args;

  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: app-runtime-storage-env
  namespace: ${namespace}
data:
  STORAGE_PROVIDER: "supabase"
  STORAGE_RUNTIME_MODE: "local"
  STORAGE_BUCKETS: "${escapeYamlDoubleQuoted(bucketsCsv)}"
  STORAGE_DEFAULT_BUCKET: "${escapeYamlDoubleQuoted(defaultBucket)}"
  EXPO_PUBLIC_STORAGE_PROVIDER: "supabase"
  EXPO_PUBLIC_STORAGE_BUCKETS: "${escapeYamlDoubleQuoted(bucketsCsv)}"
  EXPO_PUBLIC_STORAGE_DEFAULT_BUCKET: "${escapeYamlDoubleQuoted(defaultBucket)}"
`;
}

function escapeYamlDoubleQuoted(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
