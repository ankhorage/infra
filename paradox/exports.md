# Public API

## AuthRedirectConfiguration

Kind: `type`
Module: `src/authRedirects.ts`
Source: `src/authRedirects.ts:12:1`

### Members

| Name                        | Kind     | Type                | Required | Description |
| --------------------------- | -------- | ------------------- | -------- | ----------- |
| providerCallbackUrl         | property | `string`            | yes      |             |
| redirectAllowList           | property | `readonly string[]` | yes      |             |
| serializedRedirectAllowList | property | `string`            | yes      |             |
| siteUrl                     | property | `string`            | yes      |             |

## AuthRedirectEnvironment

Kind: `unknown`
Module: `src/authRedirects.ts`
Source: `src/authRedirects.ts:1:1`

## createInfraSecretStoreAdapter

Kind: `function`
Module: `src/secretStore.ts`
Source: `src/secretStore.ts:26:1`

### Signatures

- `(input: CreateInfraSecretStoreAdapterInput) => SecretStoreAdapter | null`
  - input: `CreateInfraSecretStoreAdapterInput`
  - returns: `SecretStoreAdapter | null`

## CreateInfraSecretStoreAdapterInput

Kind: `type`
Module: `src/secretStore.ts`
Source: `src/secretStore.ts:14:1`

### Members

| Name      | Kind     | Type                                      | Required | Description |
| --------- | -------- | ----------------------------------------- | -------- | ----------- |
| manifest  | property | `Pick<InfraManifestInput, "secretStore">` | yes      |             |
| providers | property | `InfraSecretStoreProviders`               | yes      |             |

## GeneratedFile

Kind: `unknown`
Module: `src/types.ts`
Source: `src/types.ts:59:1`

## GeneratedInfrastructureFile

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:3:1`

### Members

| Name       | Kind     | Type                   | Required | Description |
| ---------- | -------- | ---------------------- | -------- | ----------- |
| content    | property | `string`               | yes      |             |
| executable | property | `boolean \| undefined` | no       |             |
| path       | property | `string`               | yes      |             |

## GeneratedPackageDependency

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:12:1`

### Members

| Name    | Kind     | Type     | Required | Description |
| ------- | -------- | -------- | -------- | ----------- |
| name    | property | `string` | yes      |             |
| reason  | property | `string` | yes      |             |
| version | property | `string` | yes      |             |

## generateInfra

Kind: `function`
Module: `src/index.ts`
Source: `src/index.ts:37:1`

### Signatures

- `(input: InfraGenerationInput) => InfrastructureGenerationResult`
  - input: `InfraGenerationInput`
  - returns: `InfrastructureGenerationResult`

## generateInfrastructure

Kind: `function`
Module: `src/index.ts`
Source: `src/index.ts:41:1`

### Signatures

- `(manifest: InfraManifestInput, options?: InfrastructureGenerationOptions) => InfrastructureGenerationResult`
  - manifest: `InfraManifestInput`
  - options: `InfrastructureGenerationOptions` (optional)
  - returns: `InfrastructureGenerationResult`

## getLocalAuthRedirectPatterns

Kind: `function`
Module: `src/authRedirects.ts`
Source: `src/authRedirects.ts:48:1`

### Signatures

- `(callbackRoute: string) => readonly string[]`
  - callbackRoute: `string`
  - returns: `readonly string[]`

## InfraDiagnostic

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:62:1`

### Members

| Name     | Kind     | Type        | Required | Description |
| -------- | -------- | ----------- | -------- | ----------- |
| message  | property | `string`    | yes      |             |
| severity | property | `"warning"` | yes      |             |

## InfraGenerationInput

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:44:1`

### Members

| Name       | Kind     | Type                                           | Required | Description |
| ---------- | -------- | ---------------------------------------------- | -------- | ----------- |
| manifest   | property | `InfraManifestInput`                           | yes      |             |
| options    | property | `InfrastructureGenerationOptions \| undefined` | no       |             |
| outputRoot | property | `string \| undefined`                          | no       |             |

## InfraGenerationOptions

Kind: `unknown`
Module: `src/types.ts`
Source: `src/types.ts:57:1`

## InfraGenerationResult

Kind: `unknown`
Module: `src/types.ts`
Source: `src/types.ts:58:1`

## InfraManifestInput

Kind: `unknown`
Module: `src/types.ts`
Source: `src/types.ts:80:1`

## InfraSecretStoreProviders

Kind: `type`
Module: `src/secretStore.ts`
Source: `src/secretStore.ts:10:1`

### Members

| Name          | Kind     | Type                                       | Required | Description |
| ------------- | -------- | ------------------------------------------ | -------- | ----------- |
| supabaseVault | property | `SupabaseVaultAdapterOptions \| undefined` | no       |             |

## InfrastructureGenerationMeta

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:18:1`

### Members

| Name      | Kind     | Type                                                         | Required | Description |
| --------- | -------- | ------------------------------------------------------------ | -------- | ----------- |
| providers | property | `readonly string[]`                                          | yes      |             |
| target    | property | `import("@ankhorage/contracts/dist/types").DeploymentTarget` | yes      |             |

## InfrastructureGenerationOptions

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:30:1`

### Members

| Name          | Kind     | Type                                                                                                          | Required | Description |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| appManifest   | property | `Pick<AppManifest, "deploy" \| "infra" \| "metadata" \| "navigator" \| "screens" \| "settings"> \| undefined` | no       |             |
| namespaceHint | property | `string \| undefined`                                                                                         | no       |             |

## InfrastructureGenerationResult

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:23:1`

### Members

| Name         | Kind     | Type                                     | Required | Description |
| ------------ | -------- | ---------------------------------------- | -------- | ----------- |
| dependencies | property | `readonly GeneratedPackageDependency[]`  | yes      |             |
| files        | property | `readonly GeneratedInfrastructureFile[]` | yes      |             |
| meta         | property | `InfrastructureGenerationMeta`           | yes      |             |
| warnings     | property | `readonly string[]`                      | yes      |             |

## normalizeAuthCallbackRoute

Kind: `function`
Module: `src/authRedirects.ts`
Source: `src/authRedirects.ts:53:1`

### Signatures

- `(callbackRoute: string) => string`
  - callbackRoute: `string`
  - returns: `string`

## PackageDependency

Kind: `unknown`
Module: `src/types.ts`
Source: `src/types.ts:60:1`

## resolveAuthRedirectConfiguration

Kind: `function`
Module: `src/authRedirects.ts`
Source: `src/authRedirects.ts:19:1`

### Signatures

- `(input: ResolveAuthRedirectConfigurationInput) => AuthRedirectConfiguration`
  - input: `ResolveAuthRedirectConfigurationInput`
  - returns: `AuthRedirectConfiguration`

## ResolveAuthRedirectConfigurationInput

Kind: `type`
Module: `src/authRedirects.ts`
Source: `src/authRedirects.ts:3:1`

### Members

| Name               | Kind     | Type                             | Required | Description |
| ------------------ | -------- | -------------------------------- | -------- | ----------- |
| callbackRoute      | property | `string`                         | yes      |             |
| environment        | property | `AuthRedirectEnvironment`        | yes      |             |
| gatewayOrigin      | property | `string`                         | yes      |             |
| nativeRedirectUris | property | `readonly string[] \| undefined` | no       |             |
| siteOrigin         | property | `string`                         | yes      |             |
| webOrigins         | property | `readonly string[] \| undefined` | no       |             |
