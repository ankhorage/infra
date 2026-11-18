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

## Release verification boundary

The published package metadata and packed `@ankhorage/flow@0.10.1` artifact
verify the `./deployment` export, `FlowDeploymentDescriptorInput`, release
commit `4f1a991299d3c6e02415760b3e190fdb1dcd3a8d`, and the immutable digest
recorded above. This resolves the former Flow OCI-release blocker.

A direct registry-manifest read can still fail closed in an environment without
GHCR authorization. That is an application/provider registry-access
configuration gap, not evidence that the released digest is absent or floating.
It must remain separate from the provider-acceptance cases below.

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

## Missing application-owner implementation

The application owner is the only component permitted to call the published
`createFlowDeploymentDescriptor` function. It must use
`@ankhorage/flow@0.10.1` and pass exactly this released contract, with values
from its own declared environment rather than values inferred by Infra:

| Released input path                                           | Application-owner obligation                                                              | Not supplied by an existing published composition                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `image`                                                       | The approved immutable Flow digest                                                        | No application selects the approved digest in a workload graph.    |
| `api.apiToken`                                                | An unresolved `InfraSecretReference`                                                      | No secret resolver binding or reference identity is declared.      |
| `api.hostname`, `api.port`, `api.resources`                   | Public listener identity and capacity                                                     | No application owns the public endpoint or resource policy.        |
| `api.secretRefs`, `worker.secretRefs`                         | Process-specific unresolved secret references                                             | No secret-reference set is declared for either process.            |
| `runtime.module`                                              | One compatible module string shared by API and worker                                     | No durable runtime module is published by a consuming application. |
| `persistence`                                                 | One retained durable-volume or durable-service specification used by both workloads       | No compatible durable backend and retention policy are selected.   |
| `artifactStorage.dependencyId`, `artifactStorage.environment` | A concrete graph dependency plus reference-only storage configuration                     | No artifact-storage workload/service or configuration is declared. |
| `scheduler.dependencyId`, `scheduler.environment`             | A concrete graph dependency plus reference-only scheduler configuration                   | No scheduler workload/service or configuration is declared.        |
| complete `workloads` graph                                    | The returned Flow workloads plus all named dependency workloads                           | No application graph contains those dependency identities.         |
| provider/runtime configuration                                | Registry pull authorization, secret projection and selected runtime adapter configuration | No authorized GHCR access or provider configuration is supplied.   |
| previous immutable revision                                   | A prior compatible descriptor/image/configuration retained for rollback                   | No application-owned previous revision exists.                     |

The descriptor itself rejects a non-digest image, missing API token reference,
loopback API hostname, blank runtime module, missing worker secret references,
missing artifact/scheduler configuration, blank dependency identities, blank
environment keys and colliding environment keys. Infra must preserve those
Flow-owned rejections and then reject graph-level missing or cyclic workload
dependencies before adapter planning. It must not turn a registry
`unauthorized` response into an artifact failure or a credential fallback.

### Published composition review

The released packages were inspected on 18 November 2026. Runtime `5.5.4`
depends on Flow `^0.10.1`, but exports a host-bound remote `RuntimeFlowPort`;
it does not export or invoke the deployment descriptor and supplies none of
the server-side input above. Templates `12.6.44` has no matching Flow
deployment composition, and Projects `0.3.0` has no Flow or Infra dependency.
An organisation-wide source search likewise found no
`createFlowDeploymentDescriptor`, `FLOW_RUNTIME_MODULE`, or approved Flow
image use. Consequently none of these releases can currently own this server
deployment contract; this is an application-owner implementation gap, not a
reason to add a Flow-specific adapter in Infra.

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

The testable boundary is deliberately partitioned: Infra's existing portable
tests prove dry-run non-mutation and graph rejection for missing dependencies;
the released Flow artifact owns invalid descriptor and secret-reference input
rejection; a real application/provider fixture must prove secret resolution,
worker recovery, configuration versioning and rollback against its retained
previous revision. The latter scenarios remain unexecuted, rather than being
simulated with the existing portable fixture.

Passing generic Infra unit tests, the Flow owner's test-owned image acceptance,
or a generated plan is not evidence that any of these scenarios is deployable
through an Infra adapter. The published immutable Flow image and an
application-owned complete graph with real durable-runtime, artifact-storage,
scheduler, registry-access and secret owners are required before running the
adapter-owned container acceptance matrix. The matrix must also include
negative missing-dependency, invalid-secret, worker-failure and rollback
scenarios before this status can change.
