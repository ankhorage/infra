import type { InfraManifestInput } from '../../../types';
import { emptyMinikubeArtifacts, type MinikubeAdapterArtifacts } from '../contracts';
import { generateSupabaseStorageArtifacts } from './supabase';

export function generateStorageArtifacts(args: {
  manifest: InfraManifestInput;
  namespace: string;
}): MinikubeAdapterArtifacts {
  const { manifest, namespace } = args;
  const spec = manifest.storage;

  if (!spec) {
    return emptyMinikubeArtifacts();
  }

  const buckets = normalizeBuckets(spec.buckets);
  const { provider } = spec;
  const includeSupabaseConnectionEnvEntries = manifest.auth?.provider !== 'supabase';
  const emptyBucketsWarning =
    'Storage buckets are empty after normalization; no storage artifacts generated.';

  switch (provider) {
    case 'auto': {
      const shouldResolveToSupabase =
        manifest.database?.provider === 'supabase' || manifest.auth?.provider === 'supabase';

      if (!shouldResolveToSupabase) {
        return {
          ...emptyMinikubeArtifacts(),
          warnings: [
            'Storage provider "auto" could not be resolved for minikube; no storage artifacts generated.',
          ],
        };
      }

      if (buckets.length === 0) {
        return {
          ...emptyMinikubeArtifacts(),
          warnings: [emptyBucketsWarning],
        };
      }

      return generateSupabaseStorageArtifacts({
        namespace,
        buckets,
        includeSupabaseConnectionEnvEntries,
      });
    }
    case 'supabase': {
      if (buckets.length === 0) {
        return {
          ...emptyMinikubeArtifacts(),
          warnings: [emptyBucketsWarning],
        };
      }

      return generateSupabaseStorageArtifacts({
        namespace,
        buckets,
        includeSupabaseConnectionEnvEntries,
      });
    }
    case 's3':
    case 'r2':
      return {
        ...emptyMinikubeArtifacts(),
        warnings: [
          `Storage provider "${provider}" is not implemented for minikube yet; no storage artifacts generated.`,
        ],
      };
    default: {
      const exhaustiveCheck: never = provider;
      return exhaustiveCheck;
    }
  }
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
