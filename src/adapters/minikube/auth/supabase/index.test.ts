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

    const reconciliation = artifacts.files.find(
      (file) => file.path === 'infra/minikube/supabase/generated/auth_profiles.sql',
    );
    expect(reconciliation?.content).toContain('begin;');
    expect(reconciliation?.content).toContain('commit;');
    expect(reconciliation?.content).toContain('create table if not exists public."profiles"');
    expect(reconciliation?.content).toContain(
      'id uuid primary key references auth.users(id) on delete cascade',
    );
    expect(reconciliation?.content).toContain(
      'alter table public."profiles" add column if not exists "display_name" text',
    );
    expect(reconciliation?.content).toContain(
      'alter table public."profiles" add column if not exists "avatar_url" text',
    );
    expect(reconciliation?.content).toContain('alter table public."profiles" drop column if exists role');
    expect(reconciliation?.content).toContain(
      'alter table public."profiles" drop column if exists "first_name"',
    );
    expect(reconciliation?.content).toContain(
      'alter table public."profiles" enable row level security',
    );
    expect(reconciliation?.content).toContain(
      'revoke all on table public."profiles" from anon, authenticated',
    );
    expect(reconciliation?.content).toContain(
      'grant select on table public."profiles" to authenticated',
    );
    expect(reconciliation?.content).toContain(
      'grant update ("email", "display_name", "avatar_url") on table public."profiles" to authenticated',
    );
    expect(reconciliation?.content).not.toContain('role text not null');
    expect(reconciliation?.content).not.toContain('grant update ("role")');
    expect(reconciliation?.content).toContain('create policy "profiles_select_own"');
    expect(reconciliation?.content).toContain('to authenticated');
    expect(reconciliation?.content).toContain('create policy "profiles_update_own"');
    expect(reconciliation?.content).toContain('using ((select auth.uid()) = id)');
    expect(reconciliation?.content).toContain('create schema if not exists ankhorage_internal');
    expect(reconciliation?.content).toContain('ankhorage_internal.generated_schema_state');
    expect(reconciliation?.content).toContain("'auth.profile'");
    expect(reconciliation?.content).toContain('create trigger "on_auth_user_created_profiles"');
    expect(reconciliation?.content).toContain('after insert on auth.users');
    expect(reconciliation?.content).toContain('execute function public."handle_new_profiles_user"()');
    expect(reconciliation?.content).toContain(
      'revoke execute on function public."handle_new_profiles_user"() from PUBLIC',
    );
    expect(reconciliation?.content).not.toContain('create table if not exists public.users');
  });

  test('does not generate profile reconciliation when profile table is omitted', () => {
    const artifacts = generateSupabaseAuthArtifacts({
      namespace: 'scan-app',
      manifest: createManifest({
        profile: {
          fields: ['email', 'displayName'],
        },
      }),
    });

    expect(artifacts.files.some((file) => file.path.includes('supabase/generated'))).toBe(false);
    expect(artifacts.files.some((file) => file.path.includes('supabase/migrations'))).toBe(false);
  });

  test('uses a stable desired-state hash and canonical managed column ordering', () => {
    const first = generateSupabaseAuthArtifacts({
      namespace: 'scan-app',
      manifest: createManifest({
        profile: {
          fields: ['avatarUrl', 'email', 'displayName'],
          table: 'profiles',
        },
      }),
    });
    const second = generateSupabaseAuthArtifacts({
      namespace: 'scan-app',
      manifest: createManifest({
        profile: {
          fields: ['displayName', 'avatarUrl', 'email'],
          table: 'profiles',
        },
      }),
    });

    const firstSql = first.files.find(
      (file) => file.path === 'infra/minikube/supabase/generated/auth_profiles.sql',
    )?.content;
    const secondSql = second.files.find(
      (file) => file.path === 'infra/minikube/supabase/generated/auth_profiles.sql',
    )?.content;

    expect(firstSql).toBe(secondSql);
    expect(firstSql?.indexOf('"email"')).toBeLessThan(firstSql?.indexOf('"display_name"') ?? -1);
    expect(firstSql?.indexOf('"display_name"')).toBeLessThan(
      firstSql?.indexOf('"avatar_url"') ?? -1,
    );
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
