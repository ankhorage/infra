# Flow self-hosted deployment plan

## Status

This is a provider-neutral dry-run plan, not a deployable Flow topology. It is
blocked on a released Flow deployment descriptor. The currently published
`@ankhorage/flow@0.7.0` exports `@ankhorage/flow/server`,
`startFlowServerAsync`, the `flow.serve` CLI capability, and a headless worker
loop. The server currently starts that worker loop in-process. It does not
export a portable deployment descriptor, container image descriptor, or
independent worker entrypoint. Flow issue 24 owns that missing public
boundary and the decision whether the eventual descriptor represents combined
or independently runnable API and worker workloads.

No workload, provider, or generated artifact is added by this plan. In
particular, it must not cause `infra up` to create any Flow resource.

## Composition contract

The future Flow deployment descriptor must produce only published
`@ankhorage/contracts/infra` `InfraWorkloadSpec` values. Infra will pass those
values through its existing provider-neutral lifecycle. A descriptor is
accepted only when it declares the following topology explicitly:

| Concern               | Required descriptor contribution                                                                                                               | Infra contract                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| API service           | A `flow-api` workload, or the API facet of an explicitly combined workload, with image, command, ports and API composition                     | `InfraWorkloadSpec`                                              |
| Background worker     | The worker's explicit topology: an internal `flow-worker` workload with command, or its documented in-process relationship to the API workload | `InfraWorkloadSpec`                                              |
| Durable state         | A named retained volume or a selected durable service dependency                                                                               | `persistence`, `dependsOn`                                       |
| Secret injection      | References only; no resolved values in workload data, logs, plans or generated artifacts                                                       | `environment` / `files` with `InfraWorkloadValue.kind: 'secret'` |
| Artifact storage      | Explicit endpoint and credential references, and an owning workload or service dependency                                                      | `environment`, `dependsOn`                                       |
| Scheduler ingress     | An explicit scheduler workload or API route, with its delivery dependency                                                                      | `InfraWorkloadSpec`                                              |
| Health and readiness  | An HTTP, TCP, or command probe for each long-lived workload                                                                                    | `health`                                                         |
| Logging and telemetry | Structured, redaction-safe runtime configuration; transport and backend remain descriptor-owned                                                | `environment`                                                    |

The descriptor must state the image by immutable digest, command/arguments,
required secret-reference keys, storage and scheduler dependency identities,
probe paths or commands, resource limits, replicas, worker topology, and
upgrade/rollback compatibility. Its manifest contribution must use
`exposure: 'internal'` unless an API descriptor explicitly exposes the API
service. Infra must consume this descriptor from the released Flow public API;
it must not reproduce the descriptor, infer a second process from the current
in-process loop, or accept an unpublished package version.

The Flow core remains independent of Cloudflare, Supabase and any runtime
provider. Docker Compose, K3s and other runtime projections remain the
responsibility of their published Infra adapter packages; this package only
orders, validates and passes through portable desired state.

## Preconditions and config dry run

Before a Flow descriptor can be accepted, a dry run must fail closed unless all
of these are true:

1. A released Flow package exports the deployment descriptor from its public
   API, and the consuming application selects its declared immutable Flow
   version.
2. The descriptor validates as an `InfraWorkloadSpec` graph using the published
   `@ankhorage/contracts/infra` validators.
3. The descriptor explicitly declares whether `flow-api` and `flow-worker` are
   distinct workloads or one combined workload; a separate worker is internal.
   Every declared dependency exists, and every declared secret is an unresolved
   `InfraSecretReference`.
4. Durable state has explicit retention and the API/worker use the same
   descriptor-declared durable backend identity.
5. Artifact storage and scheduler ingress are explicit dependencies, not a
   provider name, implicit process, or Flow-core default.
6. Each long-lived workload has a published health specification. A probe is
   not treated as passing until the Flow descriptor publishes its endpoint or
   command semantics.
7. The existing `validate`, `plan`, and `generate` operations succeed without
   resolved secret material. `generate` may create review artifacts; it must
   not reconcile infrastructure.

The published `isInfraWorkloadSpec` and `parseInfraManifest` validators can
independently check the generic Infra shape before plan or generate runs. Infra
also rejects duplicate workloads and missing or cyclic workload dependencies
before any provider planning or reconciliation. These generic checks cannot
validate the Flow-specific image digest, topology, health, persistence,
scheduler, or artifact-storage semantics until the Flow descriptor exists, and
Infra must report that condition rather than substitute a guessed image,
command, port, persistence engine, scheduler, or telemetry backend.

## Required acceptance after the descriptor release

Run the same descriptor through a local/containerized runtime adapter and
retain diagnostics for each scenario:

| Scenario | Required proof                                                                                                 | Current status                          |
| -------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Start    | Descriptor-declared API and worker topology becomes ready; secret values are absent from state and diagnostics | Unexecuted: Flow descriptor unavailable |
| Stop     | Runtime stops workloads while retained durable state remains                                                   | Unexecuted: Flow descriptor unavailable |
| Restart  | A separate worker, if declared, resumes eligible work; a combined topology is restarted as one process         | Unexecuted: Flow descriptor unavailable |
| Recovery | Interrupted work is recovered without claiming stronger delivery semantics than Flow provides                  | Unexecuted: Flow descriptor unavailable |
| Rollback | A previous immutable image/config revision restores only through a descriptor-declared compatible path         | Unexecuted: Flow descriptor unavailable |

Passing generic Infra unit tests or a generated plan is not evidence that any
of these Flow scenarios is deployable. Once Flow issue 24 releases the
descriptor, keep descriptor composition in Flow, consume it only through the
released public API here, then run the complete adapter-owned container
acceptance matrix before changing this status.
