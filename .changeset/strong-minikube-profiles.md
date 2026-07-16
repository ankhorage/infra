---
'@ankhorage/infra': major
---

Rebuild generated Minikube infrastructure around one app-owned Minikube profile per app slug.

Generated local infra now uses namespace `app` for the app runtime and namespace `supabase` for Kubernetes-owned Supabase workloads. Host-owned Supabase Compose startup, `supabase-local-env.sh`, shared `minikube` profile fallbacks, and `supabase migration up --local` runtime ownership have been removed. Generated lifecycle scripts now use slug-scoped `up`, `down`, `reset`, `destroy`, `status`, and managed port-forward flows.
