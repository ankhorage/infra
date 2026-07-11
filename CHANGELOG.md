# @ankhorage/infra

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
