import type { InfraManifestInput } from '../../../../types';
import type { MinikubeAdapterArtifacts } from '../../contracts';
import {
  getSupabaseProfileReconciliation,
  type ResolvedProfileModel,
  resolveSupabaseProfileModel,
} from './profile';

export function generateSupabaseAuthArtifacts(args: {
  manifest: InfraManifestInput;
  namespace: string;
}): MinikubeAdapterArtifacts {
  const { manifest, namespace } = args;

  const root = 'infra/minikube/k8s/auth/supabase';
  const resourceRoot = 'auth/supabase';
  const docsRoot = 'infra/minikube/auth';
  const generatedRoot = 'infra/minikube/supabase/generated';
  const scope = manifest.auth?.scope ?? 'global';
  const authzEngine = manifest.auth?.authorization?.engine ?? 'native';
  const authzKind = manifest.auth?.authorization?.kind ?? 'RBAC';
  const authFieldModel = resolveAuthFieldModel(manifest);
  const profileModel = resolveSupabaseProfileModel(manifest);

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
              path: `${generatedRoot}/auth_profiles.sql`,
              content: getSupabaseProfileReconciliation(profileModel),
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
      `${resourceRoot}/app-runtime-auth.env.configmap.yaml`,
    ],
    providerLifecycle: [],
    envEntries: ['EXPO_PUBLIC_SUPABASE_URL=', 'EXPO_PUBLIC_SUPABASE_ANON_KEY='],
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

The generated profile reconciliation:

- creates the profile table
- enables row-level security
- allows signed-in users to read and update their own profile row
- drops stale Ankhorage-managed profile columns that are no longer configured
- creates a trigger for new auth users when \`AUTH_PROFILE_CREATE_STRATEGY=trigger\`
`
    : '';

  return `# Supabase Runtime Wiring

This file documents the runtime conventions generated by the minikube Supabase adapter.

## Generated Kubernetes Objects

- \`ConfigMap/supabase-auth-config\`: high-level auth metadata.
- \`Secret/supabase-public-runtime\`: browser-safe Supabase URL and anon key material, generated by \`scripts/up.sh\` after local Supabase secrets exist.
- \`ConfigMap/app-runtime-auth-env\`: auth runtime feature flags and authz metadata.

## App Runtime Convention

Your app runtime deployment should import both:

- \`app-runtime-auth-env\` (configMap)
- \`supabase-public-runtime\` (secret)

For local Expo/Metro development, \`scripts/up.sh\` also writes the same browser-safe
\`EXPO_PUBLIC_SUPABASE_URL\` and \`EXPO_PUBLIC_SUPABASE_ANON_KEY\` values to
\`\${APP_SOURCE_DIR}/.env.local\`, preserving unrelated entries. Restart Expo after
Infra Up so those public values are embedded into the client bundle.

Example deployment fragment:

\`\`\`yaml
envFrom:
  - configMapRef:
      name: app-runtime-auth-env
  - secretRef:
      name: supabase-public-runtime
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
- \`SUPABASE_URL\`
- \`SUPABASE_ANON_KEY\`
- \`EXPO_PUBLIC_SUPABASE_URL\`
- \`EXPO_PUBLIC_SUPABASE_ANON_KEY\`
${profileSection}
## Runtime Secrets

When Supabase is enabled, \`scripts/up.sh\` creates/updates \`Secret/supabase-public-runtime\`
with browser-safe values for the app namespace and mirrors the Expo public values into the
app \`.env.local\`. Privileged Supabase runtime secrets remain in the \`supabase\` namespace.
`;
}

const DEFAULT_SIGN_IN_IDENTIFIERS = ['email'];
const DEFAULT_SIGN_UP_REQUIRED_FIELDS = ['email', 'password'];
const DEFAULT_SIGN_UP_OPTIONAL_FIELDS = ['firstName', 'lastName'];
const DEFAULT_SIGN_UP_POLICY = 'autoSignIn';
interface ResolvedAuthFieldModel {
  signInIdentifiersCsv: string;
  signUpRequiredFieldsCsv: string;
  signUpOptionalFieldsCsv: string;
  signUpPolicy: string;
  profileFieldsCsv: string;
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
  const profileFields = normalizeFieldList(manifest.auth?.profile?.fields, [
    'email',
    'firstName',
    'lastName',
  ]);

  return {
    signInIdentifiersCsv: signInIdentifiers.join(','),
    signUpRequiredFieldsCsv: signUpRequiredFields.join(','),
    signUpOptionalFieldsCsv: signUpOptionalFields.join(','),
    signUpPolicy,
    profileFieldsCsv: profileFields.join(','),
  };
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

function escapeYamlDoubleQuoted(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
