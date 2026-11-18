# Flow self-hosted deployment plan

## Status

`@ankhorage/flow@0.10.1` publishes the exact portable descriptor through
`@ankhorage/flow/deployment`. Its `createFlowDeploymentDescriptor` function
creates separate `flow-api` and `flow-worker` workloads from caller-supplied,
provider-neutral inputs. Flow release `v0.10.1` is published at
`4f1a991299d3c6e02415760b3e190fdb1dcd3a8d`; the only approved runtime image
for this plan is
`ghcr.io/ankhorage/flow@sha256:d5888481fc2c0e93fed791e835ccaaeac6e42d17abb6040758fb731c27af32e8`.
It is immutable; no floating image tag is accepted.

The completed Flow release removes the OCI-publication blocker, but it does
not supply a consuming application's complete graph. A real durable-runtime,
artifact-storage, scheduler/ingress, secret-reference and registry-access
configuration remains absent, so Infra must not create a substitute workload
or provider configuration.

Infra must not add a Flow facade or reproduce the descriptor. An application
selects its published Flow version, passes its explicit deployment input to
`createFlowDeploymentDescriptor`, and places the returned workloads together
with the concrete artifact-storage and scheduler owner workloads in its
environment's declared `workloads`. Infra's existing lifecycle validates the
complete graph and passes the exact desired state to the selected runtime
adapter.

No workload, provider, or generated artifact is added by this documentation.
In particular, it must not cause `infra up` to create any Flow resource.

## Composition contract

The published `FlowDeploymentDescriptorInput` makes ownership explicit:

| Dependency                                             | Concrete owner                                                    | Required configuration that is still absent                                                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flow API and worker processes                          | `@ankhorage/flow@0.10.1`                                          | The consuming application must call the published descriptor with its own input.                                                                                              |
| Immutable image                                        | Flow release                                                      | Use only `ghcr.io/ankhorage/flow@sha256:d5888481fc2c0e93fed791e835ccaaeac6e42d17abb6040758fb731c27af32e8`; registry credentials or public-read policy have not been supplied. |
| Shared durable runtime                                 | Unidentified consuming-application owner                          | `persistence` identity and compatible API/worker runtime module.                                                                                                              |
| API listener and token                                 | Unidentified consuming-application owner                          | Non-loopback `api.hostname`, `api.port`, API resources, and unresolved `api.apiToken` reference.                                                                              |
| Worker configuration                                   | Unidentified consuming-application owner                          | Worker resources and unresolved `worker.secretRefs`.                                                                                                                          |
| Artifact storage                                       | Unidentified consuming-application owner                          | `artifactStorage.dependencyId` and reference-only environment values.                                                                                                         |
| Scheduler ingress                                      | Unidentified consuming-application owner                          | `scheduler.dependencyId` and reference-only environment values.                                                                                                               |
| Secret resolution, registry access, runtime projection | Selected Infra adapter and its configured application environment | Adapter-specific secret and registry configuration; no provider configuration has been authorized.                                                                            |
| Generic graph validation and lifecycle ordering        | `@ankhorage/infra`                                                | Complete application-owned `workloads` graph.                                                                                                                                 |

The word "unidentified" is deliberate: this repository has no evidence for a
specific application, backend, provider or credential owner and must not
invent one.

The released Flow deployment descriptor produces only published
`@ankhorage/contracts/infra` `InfraWorkloadSpec` values. Infra will pass those
values through its existing provider-neutral lifecycle. A descriptor is
accepted only when it declares the following topology explicitly:

| Concern               | Required descriptor contribution                                                                    | Infra contract                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| API service           | A public `flow-api` workload with image, `flow api` command, port and health probe                  | `InfraWorkloadSpec`                                              |
| Background worker     | An internal, independent `flow-worker` workload with `flow worker` command and command health probe | `InfraWorkloadSpec`                                              |
| Durable state         | A named retained volume or a selected durable service dependency                                    | `persistence`, `dependsOn`                                       |
| Secret injection      | References only; no resolved values in workload data, logs, plans or generated artifacts            | `environment` / `files` with `InfraWorkloadValue.kind: 'secret'` |
| Artifact storage      | Explicit endpoint and credential references, and an owning workload or service dependency           | `environment`, `dependsOn`                                       |
| Scheduler ingress     | An explicit scheduler workload or API route, with its delivery dependency                           | `InfraWorkloadSpec`                                              |
| Health and readiness  | An HTTP, TCP, or command probe for each long-lived workload                                         | `health`                                                         |
| Logging and telemetry | Structured, redaction-safe runtime configuration; transport and backend remain descriptor-owned     | `environment`                                                    |

The descriptor requires an image by immutable digest, command/arguments,
required secret-reference keys, storage and scheduler dependency identities,
probe paths or commands, resource limits, replicas and separate worker
topology. It exposes only the API workload publicly. Infra consumes the
resulting workloads through its existing public `InfraWorkloadSpec` path; it
must not reproduce the descriptor, infer processes, or use an unpublished
package version.

The Flow core remains independent of Cloudflare, Supabase and any runtime
provider. Docker Compose, K3s and other runtime projections remain the
responsibility of their published Infra adapter packages; this package only
orders, validates and passes through portable desired state.

## Preconditions and config dry run

Before a Flow deployment can be accepted, a dry run must fail closed unless all
of these are true:

1. The consuming application uses the released
   `@ankhorage/flow@0.10.1` `@ankhorage/flow/deployment` API and selects the
   approved immutable digest
   `ghcr.io/ankhorage/flow@sha256:d5888481fc2c0e93fed791e835ccaaeac6e42d17abb6040758fb731c27af32e8`.
2. The descriptor validates as an `InfraWorkloadSpec` graph using the published
   `@ankhorage/contracts/infra` validators.
3. The descriptor declares separate `flow-api` and internal `flow-worker`
   workloads. Every declared dependency is present in the complete application
   workload graph, and every declared secret is an unresolved
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

The published descriptor validates its own Flow-specific image, topology,
health, persistence, scheduler and artifact-storage inputs. Infra validates
the complete generic graph, rejecting duplicate workloads and missing or cyclic
dependencies before provider planning or reconciliation. It must report an
incomplete application graph rather than substitute an image, command, port,
persistence engine, scheduler, or telemetry backend.

## Executable portable fixture

`src/infraOperations.test.ts` contains a deliberately non-deployable
`example.invalid` fixture. It exercises the complete portable graph through
Infra `plan`: separate API and worker workloads, retained durable state,
artifact storage, scheduler, unresolved secret references, probes, public and
internal exposure, ports, resource limits, and dependency edges. It asserts
that plan forwards the graph to the runtime adapter without resolving a secret
or calling ensure/reconcile.

The fixture URI and all-zero digest are test data only, not an OCI publication
or a candidate production image. In particular, the released Flow digest is
not copied into this fixture. No test fixture workload represents an
application owner or cloud resource. Missing secret material, failed workers,
and provider-specific lifecycle outcomes cannot be established by this
provider-neutral fixture: they remain blocked until an application supplies
real durable, artifact-storage, scheduler, registry-access and secret owners.

| Case                                  | Provider-neutral result                                                       | Adapter/container result                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Complete graph dry run                | PASS: fixture reaches runtime validate and plan without mutation              | BLOCKED/UNEXECUTED: OCI digest is published, but no real application graph is supplied |
| Missing dependency                    | PASS: rejected before compute inspection or adapter plan                      | BLOCKED/UNEXECUTED: no real graph to project                                           |
| Invalid Flow descriptor configuration | BLOCKED/UNEXECUTED: owned and validated by Flow's published descriptor        | BLOCKED/UNEXECUTED                                                                     |
| Missing secret material               | BLOCKED/UNEXECUTED: runtime secret resolution is adapter-owned                | BLOCKED/UNEXECUTED                                                                     |
| Worker failure, restart and recovery  | BLOCKED/UNEXECUTED: requires real application-owned runtime and durable owner | BLOCKED/UNEXECUTED                                                                     |

## Required acceptance after the descriptor release

Run the same descriptor through a local/containerized runtime adapter and
retain diagnostics for each scenario:

| Scenario | Required proof                                                                                                 | Current status                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Start    | Descriptor-declared API and worker topology becomes ready; secret values are absent from state and diagnostics | Blocked: no complete application graph, secret/registry configuration or authorized provider configuration |
| Stop     | Runtime stops workloads while retained durable state remains                                                   | Blocked: no complete application graph, secret/registry configuration or authorized provider configuration |
| Restart  | A separate worker resumes eligible work from the shared durable backend                                        | Blocked: no application-owned durable runtime or complete graph                                            |
| Recovery | Interrupted work is recovered without claiming stronger delivery semantics than Flow provides                  | Blocked: no application-owned durable runtime or complete graph                                            |
| Rollback | A previous immutable image/config revision restores only through a descriptor-declared compatible path         | Blocked: no application-owned previous revision, compatible runtime or complete graph                      |

Passing generic Infra unit tests, the Flow owner's test-owned image acceptance,
or a generated plan is not evidence that any of these scenarios is deployable
through an Infra adapter. The published immutable Flow image and an
application-owned complete graph with real durable-runtime, artifact-storage,
scheduler, registry-access and secret owners are required before running the
adapter-owned container acceptance matrix. The matrix must also include
negative missing-dependency, invalid-secret, worker-failure and rollback
scenarios before this status can change.
