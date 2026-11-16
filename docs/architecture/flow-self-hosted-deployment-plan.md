# Flow self-hosted deployment plan

## Status

This is a provider-neutral dry-run plan, not a deployable Flow topology. It is
blocked on a released Flow server deployment descriptor. The currently
published `@ankhorage/flow@0.6.2` exports graph and durable-worker library
APIs, but does not export a server process, container image descriptor, or
server deployment descriptor. Flow issue 8 owns that missing boundary.

No workload, provider, or generated artifact is added by this plan. In
particular, it must not cause `infra up` to create any Flow resource.

## Composition contract

The future Flow server descriptor must produce only published
`@ankhorage/contracts/infra` `InfraWorkloadSpec` values. Infra will pass those
values through its existing provider-neutral lifecycle. A descriptor is
accepted only when it declares the following topology explicitly:

| Concern               | Required descriptor contribution                                                                | Infra contract                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| API service           | An internal or public `flow-api` workload, image, command, ports and API composition            | `InfraWorkloadSpec`                                              |
| Background worker     | A separate, internal `flow-worker` workload with an explicit command                            | `InfraWorkloadSpec`                                              |
| Durable state         | A named retained volume or a selected durable service dependency                                | `persistence`, `dependsOn`                                       |
| Secret injection      | References only; no resolved values in workload data, logs, plans or generated artifacts        | `environment` / `files` with `InfraWorkloadValue.kind: 'secret'` |
| Artifact storage      | Explicit endpoint and credential references, and an owning workload or service dependency       | `environment`, `dependsOn`                                       |
| Scheduler ingress     | An explicit scheduler workload or API route, with its delivery dependency                       | `InfraWorkloadSpec`                                              |
| Health and readiness  | An HTTP, TCP, or command probe for each long-lived workload                                     | `health`                                                         |
| Logging and telemetry | Structured, redaction-safe runtime configuration; transport and backend remain descriptor-owned | `environment`                                                    |

The descriptor must state the image by immutable digest, command/arguments,
required secret-reference keys, storage and scheduler dependency identities,
probe paths or commands, resource limits, replicas, and upgrade/rollback
compatibility. Its manifest contribution must use `exposure: 'internal'`
unless an API descriptor explicitly exposes the API service.

The Flow core remains independent of Cloudflare, Supabase and any runtime
provider. Docker Compose, K3s and other runtime projections remain the
responsibility of their published Infra adapter packages; this package only
orders, validates and passes through portable desired state.

## Preconditions and config dry run

Before a Flow descriptor can be accepted, a dry run must fail closed unless all
of these are true:

1. A released Flow package exports the server deployment descriptor and its
   declared Flow server version is selected by the consuming application.
2. The descriptor validates as an `InfraWorkloadSpec` graph using the published
   `@ankhorage/contracts/infra` validators.
3. `flow-api` and `flow-worker` use distinct IDs; the worker is internal; every
   declared dependency exists; and every declared secret is an unresolved
   `InfraSecretReference`.
4. Durable state has explicit retention and the API/worker use the same
   descriptor-declared durable backend identity.
5. Artifact storage and scheduler ingress are explicit dependencies, not a
   provider name, implicit process, or Flow-core default.
6. Each long-lived workload has a published health specification. A probe is
   not treated as passing until the server descriptor publishes its endpoint or
   command semantics.
7. The existing `validate`, `plan`, and `generate` operations succeed without
   resolved secret material. `generate` may create review artifacts; it must
   not reconcile infrastructure.

The published `isInfraWorkloadSpec` and `parseInfraManifest` validators can
independently check the generic Infra shape before plan or generate runs. They
cannot validate the Flow-specific items above until the Flow descriptor exists,
and Infra must report that condition rather than substitute a guessed image,
command, port, persistence engine, scheduler, or telemetry backend.

## Required acceptance after the descriptor release

Run the same descriptor through a local/containerized runtime adapter and
retain diagnostics for each scenario:

| Scenario | Required proof                                                                                         | Current status                            |
| -------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Start    | API and worker become ready; secret values are absent from state and diagnostics                       | Unexecuted: server descriptor unavailable |
| Stop     | Runtime stops workloads while retained durable state remains                                           | Unexecuted: server descriptor unavailable |
| Restart  | Worker resumes eligible work with the descriptor-declared durable backend                              | Unexecuted: server descriptor unavailable |
| Recovery | Interrupted worker work is recovered without claiming stronger delivery semantics than Flow provides   | Unexecuted: server descriptor unavailable |
| Rollback | A previous immutable image/config revision restores only through a descriptor-declared compatible path | Unexecuted: server descriptor unavailable |

Passing generic Infra unit tests or a generated plan is not evidence that any
of these Flow scenarios is deployable. Once Flow issue 8 releases the
descriptor, implement its composition in the descriptor owner, consume it only
through the released public API here, then run the complete adapter-owned
container acceptance matrix before changing this status.
