---
'@ankhorage/infra': major
---

Replace the embedded Minikube implementation and application-specific deployment helpers with a provider-neutral typed environment lifecycle.

Infra now resolves the published compute, runtime, database/auth/storage, authorization and secret-store packages selected by the canonical manifest. It exposes `validate`, `plan`, `generate`, `up`, `status`, `outputs`, `down` and `destroy` through both the standalone executable and the Ankh provider. Environment-scoped state records exact ownership and secret references, while destroy requires exact project/environment confirmation and explicit confirmation for persistent deletion.

Consumers must migrate from removed Minikube, OAuth, port-forward, reset and app-serving APIs to the canonical manifest plus the eight lifecycle commands. Project tooling should use the renamed async owner APIs from `@ankhorage/infra/project`, such as `resolveInfraProjectAsync`, `readStoredInfraStateAsync` and `writeInfraGeneratedArtifactsAsync`.
