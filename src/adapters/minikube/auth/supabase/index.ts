import type { InfraManifestInput } from '../../../../types';
import type { MinikubeAdapterArtifacts } from '../../contracts';

export function generateSupabaseAuthArtifacts(args: {
  manifest: InfraManifestInput;
  namespace: string;
}): MinikubeAdapterArtifacts {
  const { manifest, namespace } = args;

  const root = 'infra/minikube/k8s/auth/supabase';
  const resourceRoot = 'auth/supabase';
  const docsRoot = 'infra/minikube/auth';
  const migrationRoot = 'infra/minikube/supabase/migrations';
  const scope = manifest.auth?.scope ?? 'global';
  const authzEngine = manifest.auth?.authorization.engine ?? 'native';
  const authzKind = manifest.auth?.authorization.kind ?? 'RBAC';
  const authFieldModel = resolveAuthFieldModel(manifest);
  const profileModel = resolveProfileModel(manifest);

  const warnings: string[] = [];
  if (scope !== 'global') {
    warnings.push(
      `Auth scope "${scope}" is not fully modeled yet for Supabase. Baseline resources assume global auth.`,
    );
  }

  return {
    files: [
      {
        path: `${root}/supabase-auth.configmap.yaml`,
        content: getSupabaseConfigMap({
          namespace,
          scope,
          authzEngine,
          authzKind,
          authFieldModel,
          profileModel,
        }),
      },
      {
        path: `${root}/supabase-auth.secret.yaml`,
        content: getSupabaseSecret(namespace),
      },
      {
        path: `${root}/app-runtime-auth.env.configmap.yaml`,
        content: getRuntimeAuthEnvConfigMap({
          namespace,
          scope,
          authzEngine,
          authzKind,
          authFieldModel,
          profileModel,
        }),
      },
      ...(profileModel.enabled
        ? [
            {
              path: `${migrationRoot}/0001_auth_profiles.sql`,
              content: getSupabaseProfileMigration(profileModel),
            },
          ]
        : []),
      {
        path: `${docsRoot}/supabase-runtime-wiring.md`,
        content: getSupabaseRuntimeWiringGuide(profileModel),
      },
    ],
    resources: [
      `${resourceRoot}/supabase-auth.configmap.yaml`,
      `${resourceRoot}/supabase-auth.secret.yaml`,
      `${resourceRoot}/app-runtime-auth.env.configmap.yaml`,
    ],
    envEntries: [
      'SUPABASE_SECRET_SYNC_ENABLED=true',
      'SUPABASE_URL=',
      'SUPABASE_ANON_KEY=',
      'SUPABASE_SERVICE_ROLE_KEY=',
      'SUPABASE_JWT_SECRET=',
      'EXPO_PUBLIC_SUPABASE_URL=',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY=',
    ],
    warnings,
  };
}

function getSupabaseConfigMap(args: {
  namespace: string;
  scope: string;
  authzEngine: string;
  authzKind: string;
  authFieldModel: ResolvedAuthFieldModel;
  profileModel: ResolvedProfileModel;
}) {
  const { namespace, scope, authzEngine, authzKind, authFieldModel, profileModel } = args;

  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: supabase-auth-config
  namespace: ${namespace}
data:
  AUTH_PROVIDER: "supabase"
  AUTH_SCOPE: "${scope}"
  AUTHZ_ENGINE: "${authzEngine}"
  AUTHZ_KIND: "${authzKind}"
  AUTH_SIGN_IN_IDENTIFIERS: "${escapeYamlDoubleQuoted(authFieldModel.signInIdentifiersCsv)}"
  AUTH_SIGN_UP_REQUIRED_FIELDS: "${escapeYamlDoubleQuoted(authFieldModel.signUpRequiredFieldsCsv)}"
  AUTH_SIGN_UP_OPTIONAL_FIELDS: "${escapeYamlDoubleQuoted(authFieldModel.signUpOptionalFieldsCsv)}"
  AUTH_SIGN_UP_POLICY: "${authFieldModel.signUpPolicy}"
  AUTH_PROFILE_FIELDS: "${escapeYamlDoubleQuoted(authFieldModel.profileFieldsCsv)}"
  AUTH_PROFILE_TABLE: "${escapeYamlDoubleQuoted(profileModel.table)}"
  AUTH_PROFILE_PRIMARY_KEY: "${profileModel.primaryKey}"
  AUTH_PROFILE_CREATE_STRATEGY: "${profileModel.createStrategy}"
  AUTH_PROFILE_UPDATE_STRATEGY: "${profileModel.updateStrategy}"
`;
}

function getSupabaseSecret(namespace: string) {
  return `apiVersion: v1
kind: Secret
metadata:
  name: supabase-auth-secrets
  namespace: ${namespace}
type: Opaque
stringData:
  SUPABASE_URL: ""
  SUPABASE_ANON_KEY: ""
  SUPABASE_SERVICE_ROLE_KEY: ""
  SUPABASE_JWT_SECRET: ""
  EXPO_PUBLIC_SUPABASE_URL: ""
  EXPO_PUBLIC_SUPABASE_ANON_KEY: ""
`;
}

function getRuntimeAuthEnvConfigMap(args: {
  namespace: string;
  scope: string;
  authzEngine: string;
  authzKind: string;
  authFieldModel: ResolvedAuthFieldModel;
  profileModel: ResolvedProfileModel;
}) {
  const { namespace, scope, authzEngine, authzKind, authFieldModel, profileModel } = args;

  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: app-runtime-auth-env
  namespace: ${namespace}
data:
  AUTH_REQUIRED: "true"
  AUTH_PROVIDER: "supabase"
  AUTH_SCOPE: "${scope}"
  AUTHZ_ENGINE: "${authzEngine}"
  AUTHZ_KIND: "${authzKind}"
  AUTH_SIGN_IN_IDENTIFIERS: "${escapeYamlDoubleQuoted(authFieldModel.signInIdentifiersCsv)}"
  AUTH_SIGN_UP_REQUIRED_FIELDS: "${escapeYamlDoubleQuoted(authFieldModel.signUpRequiredFieldsCsv)}"
  AUTH_SIGN_UP_OPTIONAL_FIELDS: "${escapeYamlDoubleQuoted(authFieldModel.signUpOptionalFieldsCsv)}"
  AUTH_SIGN_UP_POLICY: "${authFieldModel.signUpPolicy}"
  AUTH_PROFILE_FIELDS: "${escapeYamlDoubleQuoted(authFieldModel.profileFieldsCsv)}"
  AUTH_PROFILE_TABLE: "${escapeYamlDoubleQuoted(profileModel.table)}"
  AUTH_PROFILE_PRIMARY_KEY: "${profileModel.primaryKey}"
  AUTH_PROFILE_CREATE_STRATEGY: "${profileModel.createStrategy}"
  AUTH_PROFILE_UPDATE_STRATEGY: "${profileModel.updateStrategy}"
  AUTH_TOKEN_HEADER: "Authorization"
  AUTH_TOKEN_PREFIX: "Bearer"
`;
}

function getSupabaseRuntimeWiringGuide(profileModel: ResolvedProfileModel) {
  const profileSection = profileModel.enabled
    ? `
## App Profile Table

Identity remains provider-owned in \`auth.users\`. App-facing profile data is generated in
\`public.${profileModel.table}\` and linked through \`${profileModel.table}.id -> auth.users.id\`.

The generated migration:

- creates the profile table
- enables row-level security
- allows signed-in users to read and update their own profile row
- creates a trigger for new auth users when \`AUTH_PROFILE_CREATE_STRATEGY=trigger\`
`
    : '';

  return `# Supabase Runtime Wiring

This file documents the runtime conventions generated by the minikube Supabase adapter.

## Generated Kubernetes Objects

- \`ConfigMap/supabase-auth-config\`: high-level auth metadata.
- \`Secret/supabase-auth-secrets\`: Supabase keys and public runtime keys.
- \`ConfigMap/app-runtime-auth-env\`: auth runtime feature flags and authz metadata.

## App Runtime Convention

Your app runtime deployment should import both:

- \`app-runtime-auth-env\` (configMap)
- \`supabase-auth-secrets\` (secret)

Example deployment fragment:

\`\`\`yaml
envFrom:
  - configMapRef:
      name: app-runtime-auth-env
  - secretRef:
      name: supabase-auth-secrets
\`\`\`

The generated base deployment at \`k8s/app/deployment.yaml\` already includes this wiring
with \`optional: true\` for auth sources.

## Expected Environment Variables

- \`AUTH_REQUIRED\`
- \`AUTH_PROVIDER\`
- \`AUTH_SCOPE\`
- \`AUTHZ_ENGINE\`
- \`AUTHZ_KIND\`
- \`AUTH_SIGN_IN_IDENTIFIERS\`
- \`AUTH_SIGN_UP_REQUIRED_FIELDS\`
- \`AUTH_SIGN_UP_OPTIONAL_FIELDS\`
- \`AUTH_SIGN_UP_POLICY\`
- \`AUTH_PROFILE_FIELDS\`
- \`AUTH_PROFILE_TABLE\`
- \`AUTH_PROFILE_PRIMARY_KEY\`
- \`AUTH_PROFILE_CREATE_STRATEGY\`
- \`AUTH_PROFILE_UPDATE_STRATEGY\`
- \`SUPABASE_SECRET_SYNC_ENABLED\`
- \`SUPABASE_URL\`
- \`SUPABASE_ANON_KEY\`
- \`SUPABASE_SERVICE_ROLE_KEY\`
- \`SUPABASE_JWT_SECRET\`
- \`EXPO_PUBLIC_SUPABASE_URL\`
- \`EXPO_PUBLIC_SUPABASE_ANON_KEY\`
${profileSection}
## Secret Sync

When \`SUPABASE_SECRET_SYNC_ENABLED=true\`, \`scripts/up.sh\` will create/update
\`Secret/supabase-auth-secrets\` from the loaded environment values.
`;
}

const DEFAULT_SIGN_IN_IDENTIFIERS = ['email'];
const DEFAULT_SIGN_UP_REQUIRED_FIELDS = ['email', 'password'];
const DEFAULT_SIGN_UP_OPTIONAL_FIELDS = ['firstName', 'lastName'];
const DEFAULT_SIGN_UP_POLICY = 'autoSignIn';
const DEFAULT_PROFILE_FIELDS = ['email', 'firstName', 'lastName'];
const DEFAULT_PROFILE_PRIMARY_KEY = 'authUserId';
const DEFAULT_PROFILE_CREATE_STRATEGY = 'trigger';
const DEFAULT_PROFILE_UPDATE_STRATEGY = 'api';

interface ResolvedAuthFieldModel {
  signInIdentifiersCsv: string;
  signUpRequiredFieldsCsv: string;
  signUpOptionalFieldsCsv: string;
  signUpPolicy: string;
  profileFieldsCsv: string;
}

interface ProfileColumnSpec {
  readonly field: string;
  readonly column: string;
  readonly sqlType: string;
  readonly fromNewUser: string;
}

interface ResolvedProfileModel {
  readonly enabled: boolean;
  readonly table: string;
  readonly primaryKey: string;
  readonly createStrategy: string;
  readonly updateStrategy: string;
  readonly columns: readonly ProfileColumnSpec[];
}

function resolveAuthFieldModel(manifest: InfraManifestInput): ResolvedAuthFieldModel {
  const signInIdentifiers = normalizeFieldList(
    manifest.auth?.signIn?.identifiers,
    DEFAULT_SIGN_IN_IDENTIFIERS,
  );
  const signUpRequiredFields = normalizeFieldList(
    manifest.auth?.signUp?.requiredFields,
    DEFAULT_SIGN_UP_REQUIRED_FIELDS,
  );
  const signUpOptionalFields = normalizeFieldList(
    manifest.auth?.signUp?.optionalFields,
    DEFAULT_SIGN_UP_OPTIONAL_FIELDS,
  ).filter((field) => !signUpRequiredFields.includes(field));
  const signUpPolicy = manifest.auth?.signUp?.signUpPolicy ?? DEFAULT_SIGN_UP_POLICY;
  const profileFields = normalizeFieldList(manifest.auth?.profile?.fields, DEFAULT_PROFILE_FIELDS);

  return {
    signInIdentifiersCsv: signInIdentifiers.join(','),
    signUpRequiredFieldsCsv: signUpRequiredFields.join(','),
    signUpOptionalFieldsCsv: signUpOptionalFields.join(','),
    signUpPolicy,
    profileFieldsCsv: profileFields.join(','),
  };
}

function resolveProfileModel(manifest: InfraManifestInput): ResolvedProfileModel {
  const table = normalizeIdentifier(manifest.auth?.profile?.table ?? '');
  const fields = normalizeFieldList(manifest.auth?.profile?.fields, DEFAULT_PROFILE_FIELDS);

  return {
    enabled: table.length > 0,
    table,
    primaryKey: manifest.auth?.profile?.primaryKey ?? DEFAULT_PROFILE_PRIMARY_KEY,
    createStrategy: manifest.auth?.profile?.createStrategy ?? DEFAULT_PROFILE_CREATE_STRATEGY,
    updateStrategy: manifest.auth?.profile?.updateStrategy ?? DEFAULT_PROFILE_UPDATE_STRATEGY,
    columns: resolveProfileColumns(fields),
  };
}

function getSupabaseProfileMigration(profileModel: ResolvedProfileModel): string {
  const table = quoteIdentifier(profileModel.table);
  const functionName = quoteIdentifier(`handle_new_${profileModel.table}_user`);
  const triggerName = quoteIdentifier(`on_auth_user_created_${profileModel.table}`);
  const columnDefinitions = profileModel.columns
    .map((column) => `  ${quoteIdentifier(column.column)} ${column.sqlType}`)
    .join(',\n');
  const insertColumns = ['id', ...profileModel.columns.map((column) => column.column)]
    .map(quoteIdentifier)
    .join(', ');
  const insertValues = ['new.id', ...profileModel.columns.map((column) => column.fromNewUser)].join(
    ', ',
  );
  const updateAssignments = profileModel.columns
    .filter((column) => column.field === 'email')
    .map((column) => `${quoteIdentifier(column.column)} = excluded.${quoteIdentifier(column.column)}`);
  const conflictUpdate = [...updateAssignments, 'updated_at = now()'].join(',\n    ');
  const triggerSql =
    profileModel.createStrategy === 'trigger'
      ? `
create or replace function public.${functionName}()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.${table} (${insertColumns})
  values (${insertValues})
  on conflict (id) do update set
    ${conflictUpdate};

  return new;
end;
$$;

drop trigger if exists ${triggerName} on auth.users;
create trigger ${triggerName}
  after insert on auth.users
  for each row execute function public.${functionName}();
`
      : '';

  return `-- Generated by @ankhorage/infra from manifest.infra.auth.profile.
-- Supabase Auth owns identity in auth.users. App-facing profile data lives in public.${profileModel.table}.

create table if not exists public.${table} (
  id uuid primary key references auth.users(id) on delete cascade${
    columnDefinitions ? `,\n${columnDefinitions}` : ''
  },
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.${table} enable row level security;

create policy ${quoteLiteral(`${profileModel.table}_select_own`)}
  on public.${table}
  for select
  using (auth.uid() = id);

create policy ${quoteLiteral(`${profileModel.table}_update_own`)}
  on public.${table}
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
${triggerSql}`;
}

function resolveProfileColumns(fields: readonly string[]): ProfileColumnSpec[] {
  const columns = new Map<string, ProfileColumnSpec>();

  for (const field of fields) {
    const column = mapProfileFieldToColumn(field);
    if (!column || columns.has(column.column)) {
      continue;
    }
    columns.set(column.column, column);
  }

  return [...columns.values()];
}

function mapProfileFieldToColumn(field: string): ProfileColumnSpec | null {
  switch (field) {
    case 'email':
      return { field, column: 'email', sqlType: 'text', fromNewUser: 'new.email' };
    case 'displayName':
      return {
        field,
        column: 'display_name',
        sqlType: 'text',
        fromNewUser:
          "coalesce(new.raw_user_meta_data->>'displayName', new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))",
      };
    case 'firstName':
      return {
        field,
        column: 'first_name',
        sqlType: 'text',
        fromNewUser: "coalesce(new.raw_user_meta_data->>'firstName', new.raw_user_meta_data->>'first_name')",
      };
    case 'lastName':
      return {
        field,
        column: 'last_name',
        sqlType: 'text',
        fromNewUser: "coalesce(new.raw_user_meta_data->>'lastName', new.raw_user_meta_data->>'last_name')",
      };
    case 'avatarUrl':
      return {
        field,
        column: 'avatar_url',
        sqlType: 'text',
        fromNewUser: "coalesce(new.raw_user_meta_data->>'avatarUrl', new.raw_user_meta_data->>'avatar_url')",
      };
    case 'username':
      return {
        field,
        column: 'username',
        sqlType: 'text',
        fromNewUser: "new.raw_user_meta_data->>'username'",
      };
    case 'phone':
      return { field, column: 'phone', sqlType: 'text', fromNewUser: 'new.phone' };
    default:
      return null;
  }
}

function normalizeFieldList(
  values: readonly string[] | undefined,
  fallback: readonly string[],
): string[] {
  const source = values ?? fallback;
  const next: string[] = [];

  for (const value of source) {
    const normalized = value.trim();
    if (!normalized || next.includes(normalized)) {
      continue;
    }
    next.push(normalized);
  }

  if (next.length > 0) {
    return next;
  }

  return [...fallback];
}

function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (!/^[a-z_][a-z0-9_]*$/.test(trimmed)) {
    throw new Error(
      `Invalid Supabase profile table identifier "${trimmed}". Use snake_case letters, numbers, and underscores.`,
    );
  }

  return trimmed;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function escapeYamlDoubleQuoted(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
