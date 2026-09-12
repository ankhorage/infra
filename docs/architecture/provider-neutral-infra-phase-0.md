# Provider-neutral Infra phase 0 baseline

This document records the pre-extraction architecture required by phase 0 of
[`ankhorage/infra#145`](https://github.com/ankhorage/infra/issues/145). Issue `#145` is the single
normative roadmap for the provider-neutral Infra migration. This inventory is evidence for that
roadmap; it does not introduce a second plan or child-roadmap hierarchy.

## Baseline

The inventory was taken on 2026-09-12 from these default-branch revisions:

| Repository            | Revision                                   | Inventory scope                                       |
| --------------------- | ------------------------------------------ | ----------------------------------------------------- |
| `ankhorage/infra`     | `48d3bfc0bff7a1de5d932bd8b4a2e3622b217532` | Generator, project lifecycle, CLI, ledger, tests      |
| `ankhorage/contracts` | `538bd7af779b7b7227b52e0aec83f55d2532d300` | Current Infra manifest and CLI contracts              |
| `ankhorage/templates` | `a5677190e3979bc1abced12a4b7b342a305a55f1` | Template defaults and concrete template manifests     |
| `ankhorage/studio`    | `dc41c651db76cd821a3f0183981e2e9fa38c18f5` | Authoring, generated-project lifecycle and acceptance |
| `ankhorage/ankh`      | `3fe6c88f27668fba73710a2679a2729cbb2cdc1c` | Runtime provider discovery and CLI dispatch           |

The current implementation has one generation target, `minikube`. It emits 43 files for a
representative Web + Supabase DB/Auth/Object Storage + Supabase Vault + Cerbos configuration. The
implementation under `src/adapters/minikube` contains 10,592 lines including tests. Most of that
code is not Minikube lifecycle code: it currently combines orchestration, Kubernetes projection,
Supabase and Cerbos provider behavior, application image construction, local host bridging and
generated shell execution.

## Target-owner vocabulary

Every responsibility below has one target owner. A row may describe output assembled from several
inputs, but its behavior is assigned to exactly one owner.

| Owner                             | Meaning                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Contracts                         | Canonical portable types, provider IDs, compatibility and validation metadata in `@ankhorage/contracts`                              |
| Infra                             | Provider-neutral use cases, adapter resolution/composition, dependency ordering, ledger and public CLI in `@ankhorage/infra`         |
| Local                             | Validation and portable targeting of the current host in `@ankhorage/local`                                                          |
| Kubernetes                        | Standard Kubernetes desired-resource projection, reconcile, readiness, status and output behavior in `@ankhorage/kubernetes`         |
| Minikube                          | Minikube profile/cluster lifecycle and Minikube-specific runtime bridging in `@ankhorage/minikube`                                   |
| Supabase                          | Supabase platform topology, migrations, readiness and outputs in `@ankhorage/supabase`                                               |
| Cerbos                            | Cerbos policy/configuration/workload intent in `@ankhorage/cerbos`                                                                   |
| Supabase Vault                    | Canonical SecretStore implementation and migration in `@ankhorage/supabase-vault`                                                    |
| Application workload producer     | The app/CI build boundary that produces a prebuilt image and an explicit portable workload; it is outside the Infra runtime contract |
| Studio/local development consumer | Studio or another caller that consumes Infra outputs for authoring and local app runtime configuration                               |
| Removed                           | Behavior deliberately absent from the provider-neutral architecture                                                                  |

## Current responsibility inventory

### Dispatch, orchestration and contracts

| Current source                           | Current responsibility                                                                                                                              | Target owner | Required preservation or correction                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                           | Select the generator from `infra.deployment.target` and reject missing/unknown targets                                                              | Infra        | Replace the hard-coded Minikube branch with selected adapter resolution                                                                     |
| `src/adapters/minikube/index.ts`         | Validate Minikube selection and aggregate auth, authz, storage and secret-store contributions                                                       | Infra        | Compose capability adapters through ports and dependency ordering                                                                           |
| `src/adapters/minikube/index.ts`         | Collect selected provider IDs for generation metadata                                                                                               | Infra        | Derive participants from the resolved environment adapter graph                                                                             |
| `src/adapters/minikube/contracts.ts`     | Represent generated files, Kubernetes resource paths, lifecycle shell fragments, environment entries and warnings in one Minikube-only contribution | Contracts    | Replace with adapter descriptors plus portable plan/result/status/output/workload contracts; raw shell commands are not the shared contract |
| `src/infraValidation.ts`                 | Compare open manifest strings with current support arrays and warn for unsupported values                                                           | Contracts    | Closed types and the canonical compatibility catalog must make invalid selections fail validation rather than warn                          |
| `src/infraValidation.ts`                 | Warn that internal API infrastructure is not implemented                                                                                            | Infra        | Retain as provider-neutral validation until an API workload/provider owner exists                                                           |
| `src/adapters/minikube/index.ts`         | Install `@ankhorage/state-legend` when Infra selects Legend state                                                                                   | Removed      | Application state moves to `AppManifest.state`; Infra installs no application StateAdapter                                                  |
| `src/adapters/minikube/index.ts`         | Warn for `deployment.monitoring` and `networking.cdn` without implementing either                                                                   | Removed      | Delete `monitoring`; keep networking intent only when implemented, and add observability only with a real adapter                           |
| `src/adapters/minikube/index.ts`         | Treat missing `AppManifest.deploy` as an implicit Web workload and inspect `deploy.targets.web.enabled`                                             | Removed      | Infra receives explicit portable workloads; no legacy/default Deploy inspection remains                                                     |
| `src/adapters/minikube/storage/index.ts` | Resolve object storage provider `auto` from DB/Auth selection                                                                                       | Removed      | Use an explicit closed `objectStorage.provider`; UI choices come from the Contracts catalog                                                 |
| `src/adapters/minikube/storage/index.ts` | Accept `s3` and `r2` selections but emit only warning-only no-op results                                                                            | Infra        | Resolve a selected installed provider or fail validation; never silently accept missing infrastructure                                      |

### Compute, runtime and Kubernetes behavior

| Current source                         | Current responsibility                                                                                     | Target owner | Required preservation or correction                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `base/index.ts` generated `up.sh`      | Use the canonical app slug as the Minikube profile and refuse a different `ANKH_APP_SLUG`                  | Minikube     | Preserve deterministic project isolation through runtime selection/configuration                                                   |
| `base/index.ts` generated scripts      | Assume the current host as compute and use its filesystem, process environment and local command execution | Local        | Produce a portable local compute target/context consumed by compatible runtimes                                                    |
| `base/index.ts` generated `up.sh`      | Validate `minikube`, `kubectl` and other command prerequisites                                             | Minikube     | Minikube validates its own prerequisites; other adapters validate theirs                                                           |
| `base/index.ts` generated `up.sh`      | Inspect profile host state and run `minikube start -p <slug> --driver=<driver>`                            | Minikube     | Implement idempotent runtime ensure against a portable local compute target                                                        |
| `base/index.ts` generated `down.sh`    | Stop the Minikube profile while retaining its data                                                         | Minikube     | Implement reversible runtime deactivation and report retained state                                                                |
| `base/index.ts` generated `destroy.sh` | Delete exactly the slug-owned Minikube profile                                                             | Minikube     | Implement runtime destroy behind Infra's explicit environment/destructive safeguards                                               |
| `base/index.ts` generated `status.sh`  | Report Minikube host/profile state                                                                         | Minikube     | Return canonical runtime status plus optional Minikube diagnostics                                                                 |
| `base/index.ts`                        | Generate `app`, `supabase` and provider namespaces                                                         | Kubernetes   | Project namespaces from portable ownership and workload/provider intent                                                            |
| `base/index.ts`                        | Generate Kustomization resource ordering                                                                   | Kubernetes   | Replace file-order coupling with deterministic desired-resource planning/reconcile                                                 |
| `base/index.ts`                        | Generate the app ConfigMap, Deployment and Service                                                         | Kubernetes   | Project an explicit generic workload; Infra and Minikube must not invent app workload shape                                        |
| `base/index.ts`                        | Copy `networking.domain` into app runtime configuration without provisioning DNS/TLS                       | Infra        | Keep provider-neutral public endpoint intent; do not report unmanaged domain metadata as provisioned networking                    |
| `base/index.ts` generated `up.sh`      | Apply manifests, set image, scale replicas, optionally restart and wait for rollout                        | Kubernetes   | Implement workload plan/reconcile/readiness through the shared driver                                                              |
| `base/index.ts` generated `up.sh`      | Create registry pull secrets and attach/remove `imagePullSecrets`                                          | Kubernetes   | Materialize a portable secret reference at the runtime boundary; registry management is separate                                   |
| `base/index.ts` generated `up.sh`      | Delete exact obsolete app Deployment, Service and ConfigMap for a Web-to-native change                     | Kubernetes   | Generalize to safe pruning of only Infra-owned obsolete resources                                                                  |
| `base/index.ts` lifecycle helpers      | Run provider readiness checks and status checks with `kubectl`                                             | Kubernetes   | Kubernetes executes standard resource checks; provider adapters define portable readiness intent                                   |
| `base/index.ts` generated `reset.sh`   | Delete and recreate whole generated namespaces after an app-slug confirmation                              | Removed      | `reset` is not a universal lifecycle command; keep only as an optional runtime developer operation if later justified              |
| `base/index.ts` generated scripts      | Make generated Bash files the implementation of `up`, `status`, `down` and `destroy`                       | Removed      | Typed Infra use cases invoke ports directly; `generate` may emit deterministic review artifacts but is not the runtime abstraction |

### Minikube and local developer bridge

| Current source                                                            | Current responsibility                                                                                                | Target owner                      | Required preservation or correction                                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `base/index.ts`                                                           | Derive stable, per-slug local ports for app, Supabase gateway, Studio and DB forwards                                 | Minikube                          | Preserve collision-resistant project-local endpoint mapping as Minikube host networking            |
| `base/index.ts` generated `port-forward.sh`                               | Start, stop, inspect and repair named `kubectl port-forward` processes                                                | Minikube                          | Preserve as an optional Minikube/local runtime capability, not a universal Infra command           |
| `base/index.ts` generated `port-forward.sh`                               | Track PID/log state, verify process ownership, retry transient pod/readiness failures and refuse to kill unowned PIDs | Minikube                          | Preserve exact process safety and bounded repair behavior                                          |
| `base/index.ts` generated `port-forward.sh`                               | Separate application-required `runtime` forwards from operational `all` forwards and remove obsolete owned forwards   | Minikube                          | Preserve topology-aware groups without hard-coding provider names into Infra                       |
| `base/index.ts` generated `up.sh`                                         | Load a local Docker image into Minikube or build it in Minikube's image store                                         | Minikube                          | Keep only Minikube-specific image bridge behavior; consume the workload's image reference/artifact |
| `base/index.ts` generated `build-app-image.sh` and `app-image/Dockerfile` | Run the app-owned Expo CLI, export Web, build an nginx image and label it by app/profile                              | Application workload producer     | Infra accepts the resulting image; Expo/nginx/build policy leaves the runtime adapter              |
| `base/index.ts` generated `up.sh`                                         | Copy public Supabase URL/anon key into the app root `.env.local`                                                      | Studio/local development consumer | Consume classified Infra outputs; privileged values must remain unavailable                        |
| `src/runtime.ts`                                                          | Convert a target into `infra/<target>/scripts/*.sh` and spawn Bash                                                    | Removed                           | Call resolved typed adapters/use cases instead of generated technology scripts                     |
| `src/runtime.ts`                                                          | Expose a Web URL from `APP_PORT_FORWARD_LOCAL_PORT` and repair the `runtime` forward group                            | Studio/local development consumer | Consume canonical runtime outputs and optional endpoint-repair capability                          |

### Supabase provider behavior

| Current source                                               | Current responsibility                                                                                                           | Target owner | Required preservation or correction                                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `base/index.ts`                                              | Enable one Supabase runtime if DB, Auth, Storage or Supabase Vault requires it                                                   | Supabase     | Deduplicate capability selections to one platform-provider instance                                                          |
| `base/index.ts`                                              | Pin Postgres, GoTrue, PostgREST, Realtime, Storage API, imgproxy, Postgres Meta, Kong and Studio images                          | Supabase     | Own and version the runtime-neutral Supabase workload graph                                                                  |
| `base/index.ts` Supabase manifests                           | Define Postgres bootstrap, PVC, database, Auth, REST, Realtime, Storage, imgproxy, Meta, Kong and Studio topology                | Supabase     | Contribute portable workloads/config/migrations; Kubernetes/Compose adapters project them                                    |
| `base/index.ts` generated `up.sh`                            | Generate local Supabase passwords, signing material, JWTs and runtime environment defaults                                       | Supabase     | Resolve/generate privileged provider inputs through control-plane credential sources and classified outputs                  |
| `base/index.ts` generated `up.sh`                            | Materialize privileged Supabase runtime secrets in `supabase` and public URL/anon key in `app`                                   | Kubernetes   | Materialize Supabase secret references/outputs into the selected runtime without making Kubernetes Secrets canonical storage |
| `base/index.ts` generated `up.sh`                            | Bootstrap Postgres, wait for DB, start the remaining Supabase services and wait for rollouts                                     | Supabase     | Express ordered provider reconciliation and readiness through portable provider operations/workloads                         |
| `base/supabaseMigrations.ts` and generated `up.sh`           | Run immutable app migrations through the Supabase CLI against the forwarded Kubernetes DB with command-scoped telemetry disabled | Supabase     | Preserve failure propagation, closed stdin behavior, history and deterministic order without runtime-specific branching      |
| `auth/supabase/profile.ts`                                   | Generate desired profile schema, RLS, grants, trigger and drift/state reconciliation SQL                                         | Supabase     | Preserve as Supabase Auth/DB reconciliation with stable desired-state identity                                               |
| `auth/supabase/index.ts`                                     | Generate Auth/profile runtime metadata and app-facing Auth configuration                                                         | Supabase     | Return classified outputs/config intent instead of Kubernetes-specific files                                                 |
| `auth/oauthRuntime.ts` and `auth/targetAwareOAuthRuntime.ts` | Normalize callback routes, derive Web/native redirects, update GoTrue configuration, restart Auth and report callback status     | Supabase     | Preserve target-aware OAuth reconciliation and bounded readiness through provider operations                                 |
| `storage/supabase/index.ts`                                  | Generate Supabase Storage runtime metadata and warn that buckets are not created                                                 | Supabase     | Actually reconcile declared buckets and expose object-storage outputs                                                        |
| `base/index.ts` generated `status.sh`                        | Check Supabase rollouts, secrets, DB connectivity, migrations, profile drift, Vault schema and public health                     | Supabase     | Return canonical provider status and classified outputs; Kubernetes supplies raw workload state                              |

### Authz and SecretStore behavior

| Current source                    | Current responsibility                                                                        | Target owner   | Required preservation or correction                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| `authz/index.ts`                  | Select `auth.authorization.engine`, warn for `native` and reject unknown engines              | Contracts      | `authz` becomes a sibling capability; omission means no dedicated Authz infrastructure                |
| `authz/cerbos/index.ts`           | Derive route/screen access intent from navigator guards and Auth flow routes                  | Cerbos         | Consume explicit application authorization intent without Minikube or Kubernetes assumptions          |
| `authz/cerbos/index.ts`           | Generate Cerbos configuration, policies, Deployment, Service, readiness and endpoint metadata | Cerbos         | Own policy/config/workload intent; Kubernetes owns only projection and resource status                |
| `secrets/index.ts`                | Resolve the selected Infra SecretStore implementation                                         | Infra          | Resolve the canonical adapter descriptor/package dynamically                                          |
| `secrets/supabase-vault/index.ts` | Validate OAuth credential references and generate the Supabase Vault migration/runtime guide  | Supabase Vault | Keep reference validation at the capability boundary and migration ownership in the provider package  |
| `base/index.ts` generated `up.sh` | Resolve OAuth credential payloads from Vault and inject only provider-required values         | Supabase Vault | Keep secret resolution privileged and return references/values only to authorized provider operations |
| `src/secretStore.ts`              | Build the runtime `SecretStoreAdapter` used by trusted Studio host code                       | Supabase Vault | Move provider implementation out of Infra; Infra resolves/composes the released adapter contract      |

## Generated artifacts at the baseline

The 43-file representative output establishes the generated behavior that extraction must either
preserve or deliberately replace through typed operations.

| Output group                    | Current files                                                                                     | Future behavioral owner                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Generated review/config surface | `infra/minikube/README.md`, `.env.example`                                                        | Minikube for runtime-specific guidance; Infra for classified canonical outputs           |
| Kubernetes base                 | namespaces, app ConfigMap/Deployment/Service, `kustomization.yaml`                                | Kubernetes                                                                               |
| Supabase runtime                | bootstrap SQL, Postgres/PVC, Auth, REST, Realtime, Storage, imgproxy, Meta, Kong and Studio files | Supabase desired state projected by Kubernetes                                           |
| Supabase capability config      | Auth/runtime ConfigMaps, profile SQL, Storage ConfigMaps, runtime wiring guide                    | Supabase                                                                                 |
| Cerbos                          | config/policy ConfigMaps, Deployment and Service                                                  | Cerbos desired state projected by Kubernetes                                             |
| Supabase Vault                  | migration and runtime guide                                                                       | Supabase Vault                                                                           |
| Lifecycle scripts               | `up.sh`, `down.sh`, `destroy.sh`, `reset.sh`, `status.sh`, `port-forward.sh`                      | Split according to the responsibility tables; no shared generated-shell runtime survives |
| App build                       | `build-app-image.sh`, nginx Dockerfile                                                            | Application workload producer                                                            |

## Existing consumers

### Contracts

`ankhorage/contracts` currently owns the serialized `InfraManifest`, but exposes only
`DEPLOYMENT_TARGETS = ['minikube']` while several provider selections remain open strings. Its
tests exercise the current single deployment object, nested `auth.authorization`, `storage`,
Infra-owned `state` and `monitoring`. Phase 1 must change Contracts first and release it before any
consumer migration.

### Templates and generated apps

`ankhorage/templates/src/internal/defaults.ts` defines the shared Minikube + Supabase + Vault
baseline. Chat, Stillpath and Sharkprey also contain explicit current-shape Infra manifests;
Sharkprey selects Infra-owned Legend state with unsupported declarative local persistence. The
tracked Stillpath composition artifact serializes the same shape.

Generated apps do not import Infra runtime APIs directly. They receive `ankh.config.json`,
generated `infra/minikube/**` files and package/scaffold ignore rules through Templates and Studio.
Their observable dependency is therefore the serialized manifest, generated file ownership,
runtime endpoints and lifecycle invoked by Studio or the CLI.

### Studio

Studio is the largest direct consumer:

- `ProjectManager` synchronizes Infra after create, manifest save and runtime regeneration; project
  deletion regenerates current artifacts and runs `destroy` before deleting project files.
- HTTP and orchestration code exposes generate/up/down/status behavior by invoking the public
  `@ankhorage/infra/project` API.
- `infraSession.ts` repairs runtime port-forwards, resolves the Web endpoint and stops remembered
  forwards during Studio shutdown.
- Auth diagnostics parse selected generated environment values and textual status output.
- Media ingestion resolves `storage.provider = auto`, reads Supabase public outputs and builds the
  application/runtime storage adapter.
- The trusted Secrets host creates an Infra SecretStore adapter and resolves its DB URL from the
  generated environment.
- Generated project `.gitignore` excludes `/infra/minikube/.state/`; formatting ignores all
  generated `/infra/` output.
- Studio acceptance directly exercises generated Infra through Docker, Minikube, browser
  hydration, native runtime recovery, project isolation and teardown.

Studio must migrate to environment-aware manifest editing, structured status/outputs and typed
lifecycle calls. It must not retain script-name, target-directory, status-text or provider-
compatibility knowledge.

### Infra CLI and project API

`@ankhorage/infra` currently exposes the same five commands through its standalone binary and its
Ankh runtime provider: `validate`, `generate`, `status`, `up` and `down`. `validate` reports support
warnings, `generate` writes generated files and the ledger, `up` always generates before spawning
the generated script, and `status`/`down` resolve the target from the manifest or ledger before
spawning scripts. The CLI resolves projects inside `apps/<project>` and rejects unsafe project
segments.

The public `@ankhorage/infra/project` subpath also exposes file synchronization, inspection,
environment-file reading, database URL selection, generated script execution, Web endpoint
resolution and runtime-forward repair. Phase 7 must preserve the provider-neutral use cases while
removing target-directory and generated-script details from this public boundary.

### Ankh CLI

`ankhorage/ankh` discovers `@ankhorage/infra` from package metadata and dispatches command
descriptors by the `infra` category. It owns no Infra lifecycle semantics. The Infra package
currently publishes `validate`, `generate`, `status`, `up` and `down`; phase 7 adds `plan`,
`outputs` and `destroy` while keeping Ankh's provider discovery boundary.

## Observable Minikube behavior to preserve

The non-live baseline command `bun test src` passed 118 tests, skipped 21 opt-in integration tests
and failed none (663 expectations). The test environment did not provide Docker, Minikube,
kubectl, Supabase CLI or psql, so the two-app cluster isolation and 19 Supabase profile integration
tests were recorded but not executed. Current CI likewise runs `bun run test` without enabling
those opt-in suites.

The existing automated boundary proves these behaviors:

- canonical app slug equals the isolated Minikube profile identity;
- fixed namespaces remain isolated because each app owns a distinct profile;
- Web and native-only topologies generate and repair only their real runtime endpoints;
- port-forward retries are bounded, healthy forwards are retained, obsolete owned forwards are
  removed, and unowned processes are never terminated;
- app image export uses the installed app-owned Expo CLI, rebuilds after public environment
  rotation, uses a relative nginx redirect policy and never resolves Expo from the network;
- Supabase bootstrap/migration order is deterministic and migration failure prevents success;
- public Supabase values and privileged runtime credentials remain separated;
- OAuth callback configuration is Web/native-target aware and never serializes credential values;
- generated profile reconciliation is deterministic, idempotent, drift-aware and preserves
  unrelated custom schema;
- Web-to-native reconciliation removes only the exact obsolete app Deployment, Service and
  ConfigMap;
- generated-file regeneration removes only ledger-tracked stale files;
- project and generated output paths are traversal-safe;
- `down` preserves the profile, `destroy` deletes it, and `reset` is separately confirmed.

Before deleting the old adapter in phase 8, live acceptance must run both existing opt-in commands
and their new-path equivalents:

```sh
bun run test:e2e:minikube
bun run test:e2e:supabase
```

The profile reconciliation suite gated by `ANKH_SUPABASE_INTEGRATION=1` must also be retained or
re-homed with the Supabase provider acceptance. A skipped suite is not parity evidence.

## Generated ownership and ledger semantics

The current `.ankh/infra-ledger.json` is schema version 1 and records generation time, one target,
sorted generated file paths and warnings. `syncProjectInfrastructure` writes every generated file,
sets executable mode where requested, removes the set difference from the previous valid ledger
and then rewrites the ledger. Removing `infra.deployment` deletes all previously tracked files and
the ledger. Generated paths are resolved beneath the project root and traversal is rejected.

These semantics must survive in the provider-neutral ledger:

- only resources/files with a durable Infra ownership identity may be updated or removed;
- stale removal is a desired-minus-previous-owned set difference;
- unowned files and runtime resources are retained;
- environment and adapter/provider identity replace the single `target` field;
- retention/destructive policy is recorded for persistent resources;
- an invalid or missing ledger can never authorize deletion;
- `preview` and `production` ownership cannot collide with `local`;
- Studio's dashboard project remains outside generated-app infrastructure ownership.

Current runtime side effects are not represented fully by the file ledger. Minikube owns the
profile, namespaced Kubernetes resources and port-forward PID/log files under
`infra/minikube/.state`. `up.sh` creates `infra/minikube/.env`, writes selected public values into
the app's `.env.local`, builds/loads Docker images and creates cluster secrets. Namespace/name
conventions and exact cleanup commands currently provide resource ownership; there are no general
Infra ownership labels supporting safe cross-provider pruning. Phase 1 contracts and phase 3
Kubernetes reconciliation must make these identities explicit before old-path deletion.

## Phase 0 exit gate

Every responsibility found under `src/adapters/minikube` now has one target owner in the tables
above. The current consumers, acceptance surface and ledger behavior are recorded against exact
revisions. No implementation may be moved wholesale: each extraction must follow the assigned
owner and released Contracts boundary.

Phase 1 may begin with Contracts vNext. Phase 0 does not authorize provider repository
implementation before those contracts are released and stable.
