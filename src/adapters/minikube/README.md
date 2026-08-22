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

- `scripts/up.sh`: starts `minikube -p <slug>`, applies manifests, waits for Supabase, runs migrations with CLI telemetry disabled for that command, and starts slug-owned port-forwards. It builds and deploys the Kubernetes Web app runtime only when the canonical app manifest enables `deploy.targets.web` (legacy manifests without `deploy` retain the Web runtime).
- `scripts/down.sh`: stops slug-owned port-forwards, then runs `minikube stop -p <slug>`. Persistent profile data remains.
- `scripts/reset.sh`: requires `ANKH_RESET_CONFIRM=<slug>` and deletes/recreates namespaces `app` and `supabase`, including Supabase DB and Storage PVC data. It does not delete the Minikube profile.
- `scripts/destroy.sh`: stops slug-owned port-forwards and runs `minikube delete -p <slug>`.
- `scripts/status.sh`: reports profile, namespace, workload, and port-forward health.
- `scripts/port-forward.sh`: owns topology-derived named forwards plus provider-aware `runtime` and `all` groups.
- `scripts/build-app-image.sh`: exports Expo web build from app source and builds the Docker image.

The `runtime` group is the canonical repair lifecycle for host endpoints required by the
running app. It contains `app` only when the generated topology includes the Kubernetes Web
app Service, and adds `supabase-gateway` when the generated Supabase Kubernetes runtime is
enabled. Native-only apps therefore restore provider endpoints without requiring a fictional
app Service. The group deliberately excludes `studio` and `db-migration`; `all` retains
those operational/bootstrap forwards. Start, stop, or inspect the group with
`scripts/port-forward.sh {start|stop|status} runtime`. Package consumers should call
`ensureProjectInfrastructureRuntime()` from `@ankhorage/infra/project` instead of depending
on concrete provider forward names. Forward startup retries bounded transient Kubernetes
pod-selection and readiness failures that can occur immediately after a profile restart.
Active runtime/all groups contain only targets in the generated topology. Cleanup retains
the exact identities of all Infra-managed forwards so a Web-to-native regeneration safely
stops an obsolete owned `app` forward without making it an active start target.

When the Web app runtime is disabled, `up.sh` also reconciles the former generated
`Deployment/app-runtime`, `Service/app-runtime`, and `ConfigMap/app-infra-config` with exact,
idempotent deletes. It does not prune unrelated resources or delete the `app` namespace.

## Supabase Runtime

Runtime ownership is Kubernetes. Migration authoring/history remains Supabase migration
files. Migration execution targets the Kubernetes Postgres endpoint via
`SUPABASE_TELEMETRY_DISABLED=1 supabase --yes migration up --db-url "$SUPABASE_DB_URL"`.
The migration process does not require stdin. `--yes` remains defense in depth for future
CLI prompts; it is not the hang fix. Command-scoped telemetry disable avoids the unbounded
telemetry shutdown in Supabase CLI 2.106.0 when PostHog is blocked, without changing the
user's persistent telemetry preference. Migration failures remain fatal under
`set -Eeuo pipefail`, and the completion message is printed only after a zero exit status.
The lifecycle adds no migration deadline and supports the affected CLI version; using a
current Supabase CLI is still recommended.

The generated manifests are based on the current official Supabase self-hosting Docker
topology, service documentation, environment-variable contracts, and pinned official
images. Kubernetes/Helm is treated as community-driven upstream guidance, not an
official Supabase Kubernetes distribution.

## App Image Behavior

- Default app image: `ankh/<slug>:dev`.
- By default `up.sh` triggers `build-app-image.sh` (`APP_BUILD_ENABLED=true`) before apply.
- `build-app-image.sh` runs `bunx expo export --platform web --clear`, then builds via
  `app-image/Dockerfile`. Clearing the Expo/Metro cache ensures rotated `EXPO_PUBLIC_*`
  values replace cached transforms before the browser bundle and Docker image are created.
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

For local Expo/Metro development, `up.sh` also mirrors only the browser-safe
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` values into the generated
app root `.env.local`, preserving unrelated entries. Restart Expo after Infra Up so the
client bundle sees the refreshed public Supabase values.

Only browser-safe `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` values are
eligible for client bundling. Service-role and other privileged Supabase credentials remain
outside the app public environment and must never be referenced through `EXPO_PUBLIC_*` names.

## Practical Selector Rule

When building config UI or pickers, only show currently supported values from adapter-owned
support lists (`DEPLOYMENT_TARGETS`, `DATABASE_PROVIDERS`, `AUTH_PROVIDERS`, `AUTH_SCOPES`,
`AUTHZ_ENGINES`). Do not show planned values until an adapter path exists in this folder.
