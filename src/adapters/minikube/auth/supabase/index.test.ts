import type { InfraManifest } from '@ankhorage/contracts';
import { describe, expect, test } from 'bun:test';

import { generateSupabaseAuthArtifacts } from './index';

describe('generateSupabaseAuthArtifacts profile tables', () => {
  test('generates profile metadata env vars and SQL migration when profile table is declared', () => {
    const artifacts = generateSupabaseAuthArtifacts({
      namespace: 'scan-app',
      manifest: createManifest({
        profile: {
          fields: ['email', 'displayName', 'avatarUrl'],
          table: 'profiles',
          primaryKey: 'authUserId',
          createStrategy: 'trigger',
          updateStrategy: 'api',
        },
      }),
    });

    const runtimeConfig = artifacts.files.find(
      (file) =>
        file.path === 'infra/minikube/k8s/auth/supabase/app-runtime-auth.env.configmap.yaml',
    );
    expect(runtimeConfig?.content).toContain('AUTH_PROFILE_TABLE: "profiles"');
    expect(runtimeConfig?.content).toContain('AUTH_PROFILE_PRIMARY_KEY: "authUserId"');
    expect(runtimeConfig?.content).toContain('AUTH_PROFILE_CREATE_STRATEGY: "trigger"');
    expect(runtimeConfig?.content).toContain('AUTH_PROFILE_UPDATE_STRATEGY: "api"');

    const migration = artifacts.files.find(
      (file) => file.path === 'infra/minikube/supabase/migrations/0001_auth_profiles.sql',
    );
    expect(migration?.content).toContain('create table if not exists public."profiles"');
    expect(migration?.content).toContain(
      'id uuid primary key references auth.users(id) on delete cascade',
    );
    expect(migration?.content).toContain('"display_name" text');
    expect(migration?.content).toContain('"avatar_url" text');
    expect(migration?.content).toContain('alter table public."profiles" enable row level security');
    expect(migration?.content).toContain("create policy 'profiles_select_own'");
    expect(migration?.content).toContain('using (auth.uid() = id)');
    expect(migration?.content).toContain('create trigger "on_auth_user_created_profiles"');
    expect(migration?.content).toContain('after insert on auth.users');
    expect(migration?.content).toContain('execute function public."handle_new_profiles_user"()');
  });

  test('does not generate a migration when profile table is omitted', () => {
    const artifacts = generateSupabaseAuthArtifacts({
      namespace: 'scan-app',
      manifest: createManifest({
        profile: {
          fields: ['email', 'displayName'],
        },
      }),
    });

    expect(artifacts.files.some((file) => file.path.includes('supabase/migrations'))).toBe(false);
  });
});

function createManifest(auth: Pick<NonNullable<InfraManifest['auth']>, 'profile'>): InfraManifest {
  return {
    deployment: {
      target: 'minikube',
      monitoring: false,
    },
    auth: {
      scope: 'global',
      provider: 'supabase',
      authorization: {
        kind: 'RBAC',
        engine: 'native',
      },
      ...auth,
    },
    database: {
      provider: 'supabase',
      tier: 'dev',
    },
    plugins: [],
  };
}
