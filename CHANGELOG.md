# @ankhorage/infra

## 0.3.4

### Patch Changes

- 13d1a02: Publish Infra with `@ankhorage/contracts` 2.0.0 so downstream consumers use the optional authorization contract consistently.

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
