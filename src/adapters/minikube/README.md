# Minikube Adapter

Generates local Kubernetes artifacts under `infra/minikube/*` from `InfraManifest`.

## Structure

- `base/`: namespace, app runtime, kustomization, helper scripts.
- `auth/`: auth provider artifacts (implemented: `supabase`).
- `authz/`: authorization engine artifacts (implemented: `cerbos`; `native` warning-only/no resources; `opa` unsupported).

Cerbos policy generation uses app manifest intent (navigator routes/screens + authFlow) when provided by caller.

## Runtime Scripts

- `scripts/up.sh`: starts minikube (if needed) and applies all generated manifests.
- `scripts/build-app-image.sh`: exports Expo web build from app source and builds Docker image.
- `scripts/port-forward.sh`: forwards `service/app-runtime` to local HTTP (default `127.0.0.1:18080`).
- `scripts/status.sh`: validates kube context/API reachability and shows namespace resources.
- `scripts/down.sh`: deletes generated manifests from the cluster.
- `scripts/supabase-local-env.sh`: reads `supabase status -o env` and writes Supabase keys into `infra/minikube/.env`.

Build prerequisites for `build-app-image.sh`:

- `bun` / `bunx`
- `docker`

## App Image Behavior

- Default app image: `ankh/<namespace>:dev` (for example `ankh/shop:dev`).
- By default `up.sh` triggers `build-app-image.sh` (`APP_BUILD_ENABLED=true`) before apply.
- `build-app-image.sh` runs `bunx expo export --platform web`, then builds via `app-image/Dockerfile`.
- `up.sh` syncs runtime image using `APP_IMAGE_SYNC_STRATEGY`:
  - `docker-load` (default): loads existing local Docker image into Minikube.
  - `minikube-build`: builds exported web artifacts directly into Minikube image store.
  - `none`: skips local image sync.
- Project deletion removes the exact generated `APP_IMAGE` from Minikube and host Docker on a best-effort basis.
- Generated image cleanup defaults can be overridden in `infra/minikube/.env`:
  - `APP_IMAGE_CLEANUP_ON_DOWN=false`: disables generated app image cleanup.
  - `APP_IMAGE_CLEANUP_MINIKUBE=false`: keeps the Minikube image cache entry.
  - `APP_IMAGE_CLEANUP_DOCKER=false`: keeps the host Docker image.
- Cleanup removes only the exact `APP_IMAGE`; it does not run global Docker image or network pruning.
- Private registries are supported via optional `.env` keys:
  - `APP_BUILD_ENABLED`
  - `APP_SOURCE_DIR`
  - `SUPABASE_PROJECT_DIR`
  - `APP_WEB_EXPORT_DIR`
  - `APP_IMAGE_SYNC_STRATEGY`
  - `AUTH_RUNTIME_MODE`
  - `APP_PORT_FORWARD_LOCAL_PORT`
  - `APP_PORT_FORWARD_REMOTE_PORT`
  - `SUPABASE_SECRET_SYNC_ENABLED`
  - `APP_IMAGE_PULL_SECRET_NAME`
  - `APP_IMAGE_PULL_SECRET_SERVER`
  - `APP_IMAGE_PULL_SECRET_USERNAME`
  - `APP_IMAGE_PULL_SECRET_PASSWORD`
  - `APP_IMAGE_PULL_SECRET_EMAIL`

When pull-secret values are provided, `up.sh` creates/updates the secret and patches
`deployment/app-runtime` with `imagePullSecrets`.

When `SUPABASE_SECRET_SYNC_ENABLED=true` and required Supabase keys are present,
`up.sh` creates/updates `secret/supabase-auth-secrets` from env values.

When `AUTH_RUNTIME_MODE=local` (default) and Supabase keys are missing, `up.sh`
auto-runs `scripts/supabase-local-env.sh`, reloads `.env`, and retries secret sync.
If `supabase/config.toml` is missing in `SUPABASE_PROJECT_DIR`, the helper now runs
`supabase init --yes` automatically before starting local Supabase.

## Practical Selector Rule

When building config UI or pickers, only show currently supported values from adapter-owned support lists
(`DEPLOYMENT_TARGETS`, `DATABASE_PROVIDERS`, `AUTH_PROVIDERS`, `AUTH_SCOPES`, `AUTHZ_ENGINES`).
Do not show planned values until an adapter path exists in this folder.
