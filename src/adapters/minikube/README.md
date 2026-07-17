# Minikube Adapter

Generates local Kubernetes artifacts under `infra/minikube/*` from `InfraManifest`.

## Ownership Model

- One canonical app slug owns one Minikube profile.
- The generated app runtime lives in namespace `app`.
- Supabase-owned runtime workloads live in namespace `supabase`.
- Future self-hosted providers should own deterministic provider namespaces.

There is no shared `minikube` profile, no host-level Supabase Compose runtime, and no
compatibility path for `supabase start`.

## Structure

- `base/`: app-owned profile lifecycle, `app` namespace, Supabase namespace, kustomization, helper scripts.
- `auth/`: auth provider artifacts (implemented: `supabase`).
- `authz/`: authorization engine artifacts (implemented: `cerbos`; `native` warning-only/no resources; `opa` unsupported).
- `storage/`: storage provider app-runtime config (implemented: `supabase`).
- `secrets/`: secret-store provider migrations and docs (implemented: `supabase-vault`).

Cerbos policy generation uses app manifest intent (navigator routes/screens + authFlow)
when provided by caller.

## Runtime Scripts

- `scripts/up.sh`: starts `minikube -p <slug>`, applies manifests, waits for Supabase, runs migrations with `supabase migration up --db-url "$SUPABASE_DB_URL"`, builds/loads the app image, and starts slug-owned port-forwards.
- `scripts/down.sh`: stops slug-owned port-forwards, then runs `minikube stop -p <slug>`. Persistent profile data remains.
- `scripts/reset.sh`: requires `ANKH_RESET_CONFIRM=<slug>` and deletes/recreates namespaces `app` and `supabase`, including Supabase DB and Storage PVC data. It does not delete the Minikube profile.
- `scripts/destroy.sh`: stops slug-owned port-forwards and runs `minikube delete -p <slug>`.
- `scripts/status.sh`: reports profile, namespace, workload, and port-forward health.
- `scripts/port-forward.sh`: owns named forwards for `app`, `supabase-gateway`, `studio`, and `db-migration`.
- `scripts/build-app-image.sh`: exports Expo web build from app source and builds the Docker image.

## Supabase Runtime

Runtime ownership is Kubernetes. Migration authoring/history remains Supabase migration
files. Migration execution targets the Kubernetes Postgres endpoint via
`supabase migration up --db-url "$SUPABASE_DB_URL"`.

The generated manifests are based on the current official Supabase self-hosting Docker
topology, service documentation, environment-variable contracts, and pinned official
images. Kubernetes/Helm is treated as community-driven upstream guidance, not an
official Supabase Kubernetes distribution.

## App Image Behavior

- Default app image: `ankh/<slug>:dev`.
- By default `up.sh` triggers `build-app-image.sh` (`APP_BUILD_ENABLED=true`) before apply.
- `build-app-image.sh` runs `bunx expo export --platform web`, then builds via `app-image/Dockerfile`.
- `up.sh` syncs runtime image using `APP_IMAGE_SYNC_STRATEGY`:
  - `docker-load` (default): loads existing local Docker image into the app profile.
  - `minikube-build`: builds exported web artifacts directly into the profile image store.
  - `none`: skips local image sync.
- Private registries are supported via optional `.env` keys:
  - `APP_IMAGE_PULL_SECRET_NAME`
  - `APP_IMAGE_PULL_SECRET_SERVER`
  - `APP_IMAGE_PULL_SECRET_USERNAME`
  - `APP_IMAGE_PULL_SECRET_PASSWORD`
  - `APP_IMAGE_PULL_SECRET_EMAIL`

When pull-secret values are provided, `up.sh` creates/updates the secret and patches
`deployment/app-runtime` with `imagePullSecrets`.

## Security Boundary

The app namespace receives only browser-safe Supabase URL and anon key material through
`Secret/supabase-public-runtime`. Privileged Supabase runtime credentials remain in
`Secret/supabase-runtime-secrets` in namespace `supabase`.

## Practical Selector Rule

When building config UI or pickers, only show currently supported values from adapter-owned
support lists (`DEPLOYMENT_TARGETS`, `DATABASE_PROVIDERS`, `AUTH_PROVIDERS`, `AUTH_SCOPES`,
`AUTHZ_ENGINES`). Do not show planned values until an adapter path exists in this folder.
