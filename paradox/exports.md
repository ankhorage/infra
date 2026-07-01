# Public API

## ApiInfrastructureArtifacts

Kind: `type`
Module: `src/apis.ts`
Source: `src/apis.ts:11:1`

### Members

| Name     | Kind     | Type                                     | Required | Description |
| -------- | -------- | ---------------------------------------- | -------- | ----------- |
| files    | property | `readonly GeneratedInfrastructureFile[]` | yes      |             |
| warnings | property | `readonly string[]`                      | yes      |             |

## generateApiInfrastructureArtifacts

Kind: `function`
Module: `src/apis.ts`
Source: `src/apis.ts:72:1`

### Signatures

- `(args: { readonly data: AppDataManifest | undefined; readonly databaseProvider: string | undefined; }) => ApiInfrastructureArtifacts`
  - args: `{ readonly data: AppDataManifest | undefined; readonly databaseProvider: string | undefined; }`
  - returns: `ApiInfrastructureArtifacts`

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
Source: `src/index.ts:26:1`

### Signatures

- `(input: InfraGenerationInput) => InfrastructureGenerationResult`
  - input: `InfraGenerationInput`
  - returns: `InfrastructureGenerationResult`

## generateInfrastructure

Kind: `function`
Module: `src/index.ts`
Source: `src/index.ts:30:1`

### Signatures

- `(manifest: InfraManifestInput, options?: InfrastructureGenerationOptions) => InfrastructureGenerationResult`
  - manifest: `InfraManifestInput`
  - options: `InfrastructureGenerationOptions` (optional)
  - returns: `InfrastructureGenerationResult`

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

## InfrastructureGenerationMeta

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:18:1`

### Members

| Name      | Kind     | Type                                                                                                                     | Required | Description |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------ | -------- | ----------- |
| providers | property | `readonly string[]`                                                                                                      | yes      |             |
| target    | property | `import("/Users/a_rtiphishl_e/git/ankhorage4/.tmp-infra/node_modules/@ankhorage/contracts/dist/types").DeploymentTarget` | yes      |             |

## InfrastructureGenerationOptions

Kind: `type`
Module: `src/types.ts`
Source: `src/types.ts:30:1`

### Members

| Name          | Kind     | Type                                                                                             | Required | Description |
| ------------- | -------- | ------------------------------------------------------------------------------------------------ | -------- | ----------- |
| appManifest   | property | `Pick<AppManifest, "data" \| "metadata" \| "navigator" \| "screens" \| "settings"> \| undefined` | no       |             |
| namespaceHint | property | `string \| undefined`                                                                            | no       |             |

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

## PackageDependency

Kind: `unknown`
Module: `src/types.ts`
Source: `src/types.ts:60:1`
