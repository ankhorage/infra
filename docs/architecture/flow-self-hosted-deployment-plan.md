# Flow self-hosted deployment plan

## Status

`@ankhorage/flow@0.8.0` publishes the exact portable descriptor through
`@ankhorage/flow/deployment`. Its `createFlowDeploymentDescriptor` function
creates separate `flow-api` and `flow-worker` workloads from caller-supplied,
provider-neutral inputs. The released owner acceptance verifies those
processes in a test-owned Docker network, but builds its image from the Flow
checkout; the package release has no OCI image asset.

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
   `@ankhorage/flow@0.8.0` `@ankhorage/flow/deployment` API and selects an
   immutable image it is authorized to deploy.
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

## Required acceptance after the descriptor release

Run the same descriptor through a local/containerized runtime adapter and
retain diagnostics for each scenario:

| Scenario | Required proof                                                                                                 | Current status                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Start    | Descriptor-declared API and worker topology becomes ready; secret values are absent from state and diagnostics | Blocked: no deployable Flow OCI image and application graph are published |
| Stop     | Runtime stops workloads while retained durable state remains                                                   | Blocked: no deployable Flow OCI image and application graph are published |
| Restart  | A separate worker resumes eligible work from the shared durable backend                                        | Blocked: no deployable Flow OCI image and application graph are published |
| Recovery | Interrupted work is recovered without claiming stronger delivery semantics than Flow provides                  | Blocked: no deployable Flow OCI image and application graph are published |
| Rollback | A previous immutable image/config revision restores only through a descriptor-declared compatible path         | Blocked: no deployable Flow OCI image and application graph are published |

Passing generic Infra unit tests, the Flow owner's test-owned image acceptance,
or a generated plan is not evidence that any of these scenarios is deployable
through an Infra adapter. A deployable, immutable Flow image and an
application-owned complete graph with real artifact-storage and scheduler
owners are required before running the adapter-owned container acceptance
matrix. The matrix must also include negative missing-dependency,
invalid-secret, worker-failure and rollback scenarios before this status can
change.
