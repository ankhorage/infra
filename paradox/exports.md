# Public API

## createEnvironmentInfraCredentialPort

Kind: `function`
Module: `src/features/environment-lifecycle/adapters/outbound/createEnvironmentInfraCredentialPort.ts`
Source: `src/features/environment-lifecycle/adapters/outbound/createEnvironmentInfraCredentialPort.ts:11:1`

Resolve execution-only control-plane credentials from exact-name or prefixed environment data.

### Signatures

- `(environment: Readonly<Record<string, string | undefined>>) => import("@ankhorage/contracts").InfraCredentialPort`
  - environment: `Readonly<Record<string, string | undefined>>`
  - returns: `import("@ankhorage/contracts").InfraCredentialPort`

## createEnvironmentInfraSecretPort

Kind: `function`
Module: `src/features/environment-lifecycle/adapters/outbound/createEnvironmentInfraSecretPort.ts`
Source: `src/features/environment-lifecycle/adapters/outbound/createEnvironmentInfraSecretPort.ts:7:1`

Resolve explicitly addressed secret values from environment data without serializing them.

### Signatures

- `(environment: Readonly<Record<string, string | undefined>>) => { resolveAsync(reference: import("@ankhorage/contracts").InfraSecretReference): Promise<import("@ankhorage/contracts").InfraResult<string>>; }`
  - environment: `Readonly<Record<string, string | undefined>>`
  - returns: `{ resolveAsync(reference: import("@ankhorage/contracts").InfraSecretReference): Promise<import("@ankhorage/contracts").InfraResult<string>>; }`

## createNodeInfraAdapterPackageResolver

Kind: `function`
Module: `src/features/environment-lifecycle/adapters/outbound/createNodeInfraAdapterPackageResolver.ts`
Source: `src/features/environment-lifecycle/adapters/outbound/createNodeInfraAdapterPackageResolver.ts:4:1`

Load only a catalog-selected package through the host module resolver.

### Signatures

- `() => InfraAdapterPackageResolver`
  - returns: `InfraAdapterPackageResolver`

## destroyInfraEnvironmentAsync

Kind: `function`
Module: `src/features/environment-lifecycle/application/use-cases/destroyInfraEnvironmentAsync.ts`
Source: `src/features/environment-lifecycle/application/use-cases/destroyInfraEnvironmentAsync.ts:22:1`

Destroy exact owned resources in reverse dependency order behind explicit scope confirmation.

### Signatures

- `(request: InfraDestroyOperationRequest, dependencies: InfraOrchestrationDependencies) => Promise<InfraDestroyOperationResult>`
  - dependencies: `InfraOrchestrationDependencies`
  - request: `InfraDestroyOperationRequest`
  - returns: `Promise<InfraDestroyOperationResult>`

## downInfraEnvironmentAsync

Kind: `function`
Module: `src/features/environment-lifecycle/application/use-cases/downInfraEnvironmentAsync.ts`
Source: `src/features/environment-lifecycle/application/use-cases/downInfraEnvironmentAsync.ts:15:1`

Reversibly suspend services and runtime while retaining compute and persistent data.

### Signatures

- `(request: InfraOperationRequest, dependencies: InfraOrchestrationDependencies) => Promise<InfraDownOperationResult>`
  - dependencies: `InfraOrchestrationDependencies`
  - request: `InfraOperationRequest`
  - returns: `Promise<InfraDownOperationResult>`

## generateInfraEnvironmentAsync

Kind: `function`
Module: `src/features/environment-lifecycle/application/use-cases/generateInfraEnvironmentAsync.ts`
Source: `src/features/environment-lifecycle/application/use-cases/generateInfraEnvironmentAsync.ts:15:1`

Generate deterministic review artifacts without mutating local or remote infrastructure.

### Signatures

- `(request: InfraOperationRequest, dependencies: InfraOrchestrationDependencies) => Promise<InfraGenerateOperationResult>`
  - dependencies: `InfraOrchestrationDependencies`
  - request: `InfraOperationRequest`
  - returns: `Promise<InfraGenerateOperationResult>`

## getInfraEnvironmentOutputs

Kind: `function`
Module: `src/features/environment-lifecycle/application/use-cases/getInfraEnvironmentOutputs.ts`
Source: `src/features/environment-lifecycle/application/use-cases/getInfraEnvironmentOutputs.ts:8:1`

Return only safe serialized public outputs and secret references from the canonical ledger.

### Signatures

- `(request: InfraOperationRequest) => InfraOutputsOperationResult`
  - request: `InfraOperationRequest`
  - returns: `InfraOutputsOperationResult`

## InfraAdapterPackageModule

Kind: `type`
Module: `src/features/environment-lifecycle/application/ports/outbound/infraAdapterPackage.ts`
Source: `src/features/environment-lifecycle/application/ports/outbound/infraAdapterPackage.ts:7:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| createInfraAdapter | property | `() => unknown` | yes |  |
| infraAdapterDescriptor | property | `InfraAdapterDescriptor` | yes |  |

## InfraAdapterPackageResolver

Kind: `type`
Module: `src/features/environment-lifecycle/application/ports/outbound/infraAdapterPackage.ts`
Source: `src/features/environment-lifecycle/application/ports/outbound/infraAdapterPackage.ts:3:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| loadAsync | method | `(packageName: string) => Promise<unknown>` | yes |  |

## InfraDestroyOperationRequest

Kind: `type`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:72:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| confirmation | property | `{ readonly projectId: string; readonly environment: AppEnvironmentId; }` | yes |  |
| environment | property | `string \| undefined` | no |  |
| manifest | property | `InfraManifest` | yes |  |
| persistence | property | `{ readonly policy: "retain"; } \| { readonly policy: "delete"; readonly confirmedResources: readonly import("@ankhorage/contracts").InfraResourceIdentity[]; }` | yes |  |
| previous | property | `InfraLedger \| undefined` | no |  |
| previousDesired | property | `InfraEnvironmentSpec \| undefined` | no |  |
| projectId | property | `string` | yes |  |
| signal | property | `any` | no |  |

## InfraDestroyOperationResult

Kind: `unknown`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:126:1`

## InfraDestroyResult

Kind: `type`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:121:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| environment | property | `"local" \| "preview" \| "production"` | yes |  |
| ledger | property | `InfraLedger \| null` | yes |  |

## InfraDownOperationResult

Kind: `unknown`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:119:1`

## InfraDownResult

Kind: `type`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:114:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| environment | property | `"local" \| "preview" \| "production"` | yes |  |
| ledger | property | `InfraLedger` | yes |  |

## InfraGenerateOperationResult

Kind: `unknown`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:103:1`

## InfraGenerateResult

Kind: `type`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:97:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| artifacts | property | `readonly InfraGeneratedArtifact[]` | yes |  |
| environment | property | `"local" \| "preview" \| "production"` | yes |  |
| ledger | property | `InfraLedger` | yes |  |

## InfraOperationRequest

Kind: `type`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:63:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| environment | property | `string \| undefined` | no |  |
| manifest | property | `InfraManifest` | yes |  |
| previous | property | `InfraLedger \| undefined` | no |  |
| previousDesired | property | `InfraEnvironmentSpec \| undefined` | no |  |
| projectId | property | `string` | yes |  |
| signal | property | `any` | no |  |

## InfraOrchestrationDependencies

Kind: `type`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:57:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| adapterResolver | property | `InfraAdapterPackageResolver` | yes |  |
| credentials | property | `import("@ankhorage/contracts").InfraCredentialPort` | yes |  |
| secrets | property | `{ resolveAsync(reference: import("@ankhorage/contracts").InfraSecretReference): Promise<InfraResult<string>>; }` | yes |  |

## InfraOutputsOperationResult

Kind: `unknown`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:112:1`

## InfraOutputsResult

Kind: `type`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:107:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| environment | property | `"local" \| "preview" \| "production"` | yes |  |
| outputs | property | `readonly InfraOutput[]` | yes |  |

## InfraPlanOperationResult

Kind: `unknown`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:95:1`

## InfraStatusOperationResult

Kind: `unknown`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:105:1`

## InfraStoredState

Kind: `type`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:43:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| desired | property | `InfraEnvironmentSpec` | yes |  |
| ledger | property | `InfraLedger` | yes |  |
| schemaVersion | property | `1` | yes |  |

## InfraUpOperationResult

Kind: `unknown`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:93:1`

## InfraUpRequest

Kind: `unknown`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:83:1`

## InfraUpResult

Kind: `type`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:85:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| environment | property | `"local" \| "preview" \| "production"` | yes |  |
| ledger | property | `InfraLedger` | yes |  |
| outputs | property | `readonly InfraOutput[]` | yes |  |
| resources | property | `readonly InfraOwnedResource[]` | yes |  |
| targets | property | `readonly InfraComputeTarget[]` | yes |  |

## InfraValidateOperationResult

Kind: `unknown`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:81:1`

## InfraValidateResult

Kind: `type`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:77:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| environment | property | `"local" \| "preview" \| "production"` | yes |  |

## orderInfraPlanActions

Kind: `function`
Module: `src/features/environment-lifecycle/domain/orderInfraPlanActions.ts`
Source: `src/features/environment-lifecycle/domain/orderInfraPlanActions.ts:8:1`

Order plan actions dependency-first and reject duplicate owners or dependency cycles.

### Signatures

- `(actions: readonly InfraPlanAction[]) => InfraResult<readonly InfraPlanAction[]>`
  - actions: `readonly InfraPlanAction[]`
  - returns: `InfraResult<readonly InfraPlanAction[]>`

## planInfraEnvironmentAsync

Kind: `function`
Module: `src/features/environment-lifecycle/application/use-cases/planInfraEnvironmentAsync.ts`
Source: `src/features/environment-lifecycle/application/use-cases/planInfraEnvironmentAsync.ts:13:1`

Aggregate a side-effect-free dependency-ordered plan from all selected adapters.

### Signatures

- `(request: InfraOperationRequest, dependencies: InfraOrchestrationDependencies) => Promise<InfraPlanOperationResult>`
  - dependencies: `InfraOrchestrationDependencies`
  - request: `InfraOperationRequest`
  - returns: `Promise<InfraPlanOperationResult>`

## PreparedInfraOperation

Kind: `type`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:49:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| adapters | property | `ResolvedInfraAdapters` | yes |  |
| compute | property | `InfraComputeSnapshot` | yes |  |
| context | property | `InfraExecutionContext` | yes |  |
| environment | property | `ResolvedInfraEnvironment` | yes |  |
| runtimeDesired | property | `InfraRuntimeDesiredState<"minikube" \| "k3s" \| "docker-compose">` | yes |  |

## ResolvedInfraAdapters

Kind: `type`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:37:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| compute | property | `InfraComputeAdapter<import("@ankhorage/contracts").InfraComputeProviderId>` | yes |  |
| runtime | property | `InfraRuntimeAdapter<"minikube" \| "k3s" \| "docker-compose">` | yes |  |
| services | property | `readonly InfraServiceAdapter[]` | yes |  |

## ResolvedInfraEnvironment

Kind: `type`
Module: `src/types/infraOrchestration.ts`
Source: `src/types/infraOrchestration.ts:24:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| desired | property | `InfraEnvironmentSpec` | yes |  |
| id | property | `"local" \| "preview" \| "production"` | yes |  |
| manifest | property | `InfraManifest` | yes |  |

## resolveInfraAdaptersAsync

Kind: `function`
Module: `src/features/environment-lifecycle/application/use-cases/resolveInfraAdaptersAsync.ts`
Source: `src/features/environment-lifecycle/application/use-cases/resolveInfraAdaptersAsync.ts:21:1`

Resolve exactly the selected provider packages and validate their public adapter boundaries.

### Signatures

- `(environment: InfraEnvironmentSpec, resolver: InfraAdapterPackageResolver) => Promise<InfraResult<ResolvedInfraAdapters>>`
  - environment: `InfraEnvironmentSpec`
  - resolver: `InfraAdapterPackageResolver`
  - returns: `Promise<InfraResult<ResolvedInfraAdapters>>`

## resolveInfraEnvironment

Kind: `function`
Module: `src/features/environment-lifecycle/domain/resolveInfraEnvironment.ts`
Source: `src/features/environment-lifecycle/domain/resolveInfraEnvironment.ts:10:1`

Resolve one explicitly configured environment while keeping local as the only safe default.

### Signatures

- `(request: InfraEnvironmentResolutionRequest) => InfraResult<ResolvedInfraEnvironment>`
  - request: `InfraEnvironmentResolutionRequest`
  - returns: `InfraResult<ResolvedInfraEnvironment>`

## statusInfraEnvironmentAsync

Kind: `function`
Module: `src/features/environment-lifecycle/application/use-cases/statusInfraEnvironmentAsync.ts`
Source: `src/features/environment-lifecycle/application/use-cases/statusInfraEnvironmentAsync.ts:12:1`

Aggregate provider-neutral compute, runtime and service status.

### Signatures

- `(request: InfraOperationRequest, dependencies: InfraOrchestrationDependencies) => Promise<InfraStatusOperationResult>`
  - dependencies: `InfraOrchestrationDependencies`
  - request: `InfraOperationRequest`
  - returns: `Promise<InfraStatusOperationResult>`

## upInfraEnvironmentAsync

Kind: `function`
Module: `src/features/environment-lifecycle/application/use-cases/upInfraEnvironmentAsync.ts`
Source: `src/features/environment-lifecycle/application/use-cases/upInfraEnvironmentAsync.ts:26:1`

Validate and reconcile compute, service preparation, workloads, runtime and services in order.

### Signatures

- `(request: import("../../../../index.js").InfraOperationRequest, dependencies: InfraOrchestrationDependencies) => Promise<InfraUpOperationResult>`
  - dependencies: `InfraOrchestrationDependencies`
  - request: `import("../../../../index.js").InfraOperationRequest`
  - returns: `Promise<InfraUpOperationResult>`

## validateInfraEnvironmentAsync

Kind: `function`
Module: `src/features/environment-lifecycle/application/use-cases/validateInfraEnvironmentAsync.ts`
Source: `src/features/environment-lifecycle/application/use-cases/validateInfraEnvironmentAsync.ts:9:1`

Validate one environment and every selected adapter without mutating infrastructure.

### Signatures

- `(request: InfraOperationRequest, dependencies: InfraOrchestrationDependencies) => Promise<InfraValidateOperationResult>`
  - dependencies: `InfraOrchestrationDependencies`
  - request: `InfraOperationRequest`
  - returns: `Promise<InfraValidateOperationResult>`
