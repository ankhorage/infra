# @ankhorage/infra

## 3.0.0

### Major Changes

- e4549c9: Consume the canonical Contracts 6 module manifest boundary and require `infra.modules` instead of the removed legacy `infra.plugins` field.

## 2.0.1

### Patch Changes

- 6ff65a4: Keep Supabase Auth runtime environment assignments declarative across OAuth reconciliation so repeated Minikube Infra Up runs can safely reapply the generated deployment.

## 2.0.0

### Major Changes

- a4dda40: Consume the canonical generated API desired-state contract, generate deterministic Supabase/Postgres database artifacts, and remove the obsolete generated API handler/OpenAPI artifact surface.

## 1.1.0

### Minor Changes

- bd82fe0: Add canonical environment-aware Auth redirect configuration and reconcile Minikube GoTrue callback settings through a forced, bounded deployment rollout.

## 1.0.6

### Patch Changes

- 296d006: update SUPABASE-VAULT

## 1.0.5

### Patch Changes

- f566fef: Update SUPABASE-VAULT

## 1.0.4

### Patch Changes

- 434d4da: Clear the Expo/Metro export cache before building generated Minikube app images so rotated browser-safe Supabase credentials replace stale values in the client bundle.

## 1.0.3

### Patch Changes

- 9ab757e: Prevent generated Supabase migration lifecycles from waiting indefinitely on blocked CLI telemetry, and report visible migration progress.

## 1.0.2

### Patch Changes

- aba801b: Preserve the browser-visible forwarded origin when generated app nginx redirects canonical static routes such as `/products` to `/products/`.

## 1.0.1

### Patch Changes

- efa43ed: Write generated Supabase browser env values into the app `.env.local` during Minikube Infra
  Up so local Expo auth clients receive the gateway URL and anon key.

## 1.0.0

### Major Changes

- 04b6470: Rebuild generated Minikube infrastructure around one app-owned Minikube profile per app slug.

  Generated local infra now uses namespace `app` for the app runtime and namespace `supabase` for Kubernetes-owned Supabase workloads. Host-owned Supabase Compose startup, `supabase-local-env.sh`, shared `minikube` profile fallbacks, and `supabase migration up --local` runtime ownership have been removed. Generated lifecycle scripts now use slug-scoped `up`, `down`, `reset`, `destroy`, `status`, and managed port-forward flows.

## 0.4.2

### Patch Changes

- 53c8e75: Make generated disabled Supabase profile verification safe when local generated profile state has
  never existed.

## 0.4.1

### Patch Changes

- f48b53f: Preserve app-specific Supabase local project identity while keeping the canonical Minikube workdir.

## 0.4.0

### Minor Changes

- dd7c668: Compose the canonical secret-store adapter from `infra.secretStore.provider`, generate the released Supabase Vault migration through the existing local Supabase lifecycle, and validate OAuth credential references before infrastructure generation.

## 0.3.7

### Patch Changes

- 1f86a8e: Finalize the generated API handler promise normalization so the package passes CI and generated apps remain compatible with `@typescript-eslint/require-await`.

## 0.3.6

### Patch Changes

- 89eb7cf: Generate in-memory API store methods with explicit `Promise.resolve(...)` returns instead of unnecessary `async`, so generated apps pass `@typescript-eslint/require-await`.

## 0.3.5

### Patch Changes

- ad6fd70: Support authentication manifests without authorization, resolve auth routes from the canonical `infra.auth.flow`, and keep Cerbos generation compatible with manifests that omit infra context.

## 0.3.4

### Patch Changes

- 13d1a02: Publish Infra against `@ankhorage/contracts` 2.0.0 so downstream consumers use the optional authorization contract consistently.

## 0.3.3

### Patch Changes

- 77be403: Make generated local Supabase profile schema deterministic by separating immutable migrations from generated reconciliation, applying profile desired state during local startup, and verifying the live database schema.

## 0.3.2

### Patch Changes

- f407622: Move the standalone infrastructure CLI and its tests under the canonical `src/cli/` package boundary while preserving the published `ankhorage-infra` binary.

## 0.3.1

### Patch Changes

- 997af24: Release package command entry changes.

## 0.3.0

### Minor Changes

- 0952c75: Add executable Ankh infra provider metadata, standalone CLI, and shared command dispatch.

## 0.2.1

### Patch Changes

- 9839fba: Update CONTRACTS & update docs

## 0.2.0

### Minor Changes

- 6abebe9: Generate Supabase profile table metadata and migrations from `manifest.infra.auth.profile`.

## 0.1.0

### Minor Changes

- a8dfa6b: Generate infrastructure artifacts from API definitions.
